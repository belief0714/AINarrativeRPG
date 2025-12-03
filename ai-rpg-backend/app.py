import os
import time
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI  # 兼容 DeepSeek API
from aip import AipSpeech  # 百度 AI 语音 SDK
import ffmpeg  # FFmpeg Python 绑定

# --- 1. 初始化和配置 ---
load_dotenv()
app = Flask(__name__)
CORS(app)

# DeepSeek LLM 配置
deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
deepseek_base_url = os.getenv("DEEPSEEK_API_BASE")
if not deepseek_api_key or not deepseek_base_url:
    raise ValueError("请在 .env 中设置 DEEPSEEK_API_KEY 和 DEEPSEEK_API_BASE。")
llm_client = OpenAI(api_key=deepseek_api_key, base_url=deepseek_base_url)

# Baidu AI 语音配置
baidu_app_id = os.getenv("BAIDU_APP_ID")
baidu_api_key = os.getenv("BAIDU_API_KEY")
baidu_secret_key = os.getenv("BAIDU_SECRET_KEY")
if not (baidu_app_id and baidu_api_key and baidu_secret_key):
    raise ValueError("请在 .env 中设置 BAIDU_APP_ID/API_KEY/SECRET_KEY。")
baidu_speech_client = AipSpeech(baidu_app_id, baidu_api_key, baidu_secret_key)

# 临时存储录音文件的目录 (STT 输入和 TTS 输出)
UPLOAD_FOLDER = 'temp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 核心数据结构：对话历史 (全局存储，MVP 方案)
conversation_history = {}

# 角色定义
SYSTEM_PROMPTS = {
    "narrator": "你是一个悬疑故事的叙事引导者。你的职责是描述场景、引入角色和推进剧情。说话风格沉稳且富有悬念。你每次发言结束后，要询问玩家的行动或选择。",
    "characterA": "你叫李明，是故事中的侦探。性格沉着冷静，逻辑严密，专注于寻找线索。说话时保持理性。",
    "characterB": "你叫王芳，是被害人的妹妹。性格冲动易怒，一心想为哥哥复仇。说话时语气激烈。"
}


# --- 2. 核心路由：语音输入/文本输入 -> DeepSeek LLM -> 百度 TTS 语音输出 ---

@app.route('/chat', methods=['POST'])
def chat_handler():
    # 初始化变量，用于 try/finally 和通用逻辑块
    session_id = None
    original_audio_path = None
    converted_audio_path = None
    user_text = None
    target_role = 'narrator'

    # 尝试从 Form Data (语音) 或 JSON (文本) 中获取参数
    audio_file = request.files.get('audio')

    try:
        if audio_file:
            # --- PATH 1: Voice Input (Form Data) ---
            session_id = request.form.get('session_id', 'default_session')
            target_role = request.form.get('target_role', 'narrator')

            # 1. 临时保存和 FFmpeg 转换
            timestamp = int(time.time() * 1000)
            original_audio_path = os.path.join(app.config['UPLOAD_FOLDER'],
                                               f"input_original_{session_id}_{timestamp}.webm")
            converted_audio_path = os.path.join(app.config['UPLOAD_FOLDER'],
                                                f"input_converted_{session_id}_{timestamp}.wav")
            audio_file.save(original_audio_path)

            try:
                print(f"尝试使用 FFmpeg 转换文件: {original_audio_path} -> {converted_audio_path}")
                (
                    ffmpeg
                    .input(original_audio_path)
                    .output(converted_audio_path, format='wav', acodec='pcm_s16le', ar='16000')
                    .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
                )
            except ffmpeg.Error as e:
                error_msg = e.stderr.decode('utf8')
                print("FFmpeg 转换失败！")
                return jsonify({"error": "FFmpeg转换失败", "details": error_msg}), 500

            # 2. 调用 Baidu STT
            with open(converted_audio_path, 'rb') as f:
                audio_data = f.read()

            stt_result = baidu_speech_client.asr(audio_data, 'wav', 16000)
            print(f"Baidu STT 原始返回结果: {stt_result}")

            if stt_result.get('err_no') != 0:
                return jsonify({"error": "语音转文本失败", "details": stt_result.get('err_msg')}), 500

            user_text = stt_result['result'][0].strip()
            print(f"STT 成功，用户文本: {user_text}")

            if not user_text:
                # 语音识别结果为空，返回提示
                tts_result_no_text = baidu_speech_client.synthesis("我没有听清，请您对着麦克风再说一遍。", 'zh', 1,
                                                                   {'per': 0})
                ai_audio_filename = f"reply_no_text_{session_id}_{timestamp}.mp3"
                ai_audio_path = os.path.join(app.config['UPLOAD_FOLDER'], ai_audio_filename)

                if isinstance(tts_result_no_text, dict):
                    return jsonify({"error": "TTS提示音失败", "details": tts_result_no_text.get('err_msg')}), 500

                with open(ai_audio_path, 'wb') as f:
                    f.write(tts_result_no_text)

                return jsonify({
                    "text": "我没有听清，请您对着麦克风再说一遍。",
                    "audio_url": f'/static/{ai_audio_filename}',
                    "role": target_role,
                    "user_text": "（未识别到有效语音）"
                }), 200

        else:
            # --- PATH 2: Text Input (JSON) ---
            data = request.get_json()
            if not data:
                return jsonify({"error": "请求格式错误，缺少音频文件或JSON数据"}), 400

            user_text = data.get('text', '').strip()
            session_id = data.get('session_id', 'default_session')
            target_role = data.get('target_role', 'narrator')

            if not user_text:
                return jsonify({"error": "文本输入不能为空"}), 400

            print(f"接收到用户文本输入: {user_text}")

        # --- B. DeepSeek LLM 生成 AI 回复 (通用逻辑) ---
        if session_id not in conversation_history:
            conversation_history[session_id] = []

        current_history = conversation_history[session_id]

        # 1. 动态设置 SYSTEM 提示词
        current_system_content = SYSTEM_PROMPTS.get(target_role, SYSTEM_PROMPTS['narrator'])

        # 检查和更新 SYSTEM 消息
        if not current_history or current_history[0]["role"] != "system":
            system_message = {"role": "system", "content": current_system_content}
            current_history.insert(0, system_message)
        elif current_history[0]["content"] != current_system_content:
            # 更新 SYSTEM 消息 (实现角色切换)
            current_history[0]["content"] = current_system_content

        # 2. 添加用户输入
        current_history.append({"role": "user", "content": user_text})

        llm_response = llm_client.chat.completions.create(
            model="deepseek-chat",
            messages=current_history,
            temperature=0.7
        )

        # 3. 获取 AI 回复并添加到历史
        ai_reply = llm_response.choices[0].message.content.strip()
        current_history.append({"role": "assistant", "content": ai_reply})
        print(f"DeepSeek ({target_role}) 回复文本: {ai_reply}")

        # --- C. TTS (文本转语音) 生成音频 (通用逻辑) ---
        timestamp = int(time.time() * 1000)

        # 1. 调用 Baidu TTS API
        tts_result = baidu_speech_client.synthesis(ai_reply, 'zh', 1, {'per': 0})

        if isinstance(tts_result, dict):  # Baidu TTS 错误会返回字典
            return jsonify({"error": "文本转语音失败", "details": tts_result.get('err_msg')}), 500

        # 2. 保存 TTS 生成的音频文件
        ai_audio_filename = f"reply_{session_id}_{timestamp}.mp3"
        ai_audio_path = os.path.join(app.config['UPLOAD_FOLDER'], ai_audio_filename)

        with open(ai_audio_path, 'wb') as f:
            f.write(tts_result)

        # --- D. 返回结果 ---

        audio_url = f'/static/{ai_audio_filename}'

        return jsonify({
            "text": ai_reply,
            "audio_url": audio_url,
            "role": target_role,
            "user_text": user_text
        })

    except Exception as e:
        print(f"发生错误: {e}")
        # 发生错误时，将用户最后一条消息从历史中移除
        if session_id and session_id in conversation_history and conversation_history[session_id][-1]["role"] == "user":
            conversation_history[session_id].pop()

        return jsonify({"error": "处理请求时发生内部错误", "details": str(e)}), 500

    finally:
        # --- 确保清理原始输入文件和转换后的文件 (仅在语音路径中存在) ---
        if original_audio_path and os.path.exists(original_audio_path):
            os.remove(original_audio_path)
        if converted_audio_path and os.path.exists(converted_audio_path):
            os.remove(converted_audio_path)


# --- 3. 静态文件路由（供前端访问 AI 生成的音频） ---

@app.route('/static/<filename>')
def serve_audio(filename):
    """设置一个路由让前端可以获取到生成的音频文件"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# --- 4. 启动应用 ---

if __name__ == '__main__':
    app.run(debug=True, port=5000)