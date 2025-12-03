import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';

// --- 常量 ---
const BACKEND_URL = 'http://127.0.0.1:5000/chat';
// 使用 useRef 创建一个会话 ID，保证用户不刷新页面就不会变
const useSessionId = () => useRef(Date.now().toString()).current;

// 可用的 AI 角色列表
const AI_ROLES = [
  { value: 'narrator', name: '引导者 (故事推进)' },
  { value: 'characterA', name: '李明 (侦探)' },
  { value: 'characterB', name: '王芳 (妹妹)' },
];

const ChatInterface = () => {
  const sessionId = useSessionId();

  // --- 状态 (State) 和引用 (Ref) ---

  // 存储对话历史
  const [messages, setMessages] = useState([
    { role: 'narrator', content: '欢迎来到黑夜镇。我是引导者。请告诉我，你叫什么名字？', audioUrl: null },
  ]);

  // 当前用户想要对话的目标 AI 角色
  const [targetRole, setTargetRole] = useState('narrator');

  // 输入框状态 (关键：负责文本显示)
  const [inputText, setInputText] = useState('');
  // 加载状态 (AI思考中)
  const [isLoading, setIsLoading] = useState(false);

  // 录音状态和 MediaRecorder 实例
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // 存储录音片段
  const audioChunksRef = useRef([]);
  // 用于自动滚动到底部
  const messagesEndRef = useRef(null);
  // 追踪当前正在播放的音频对象
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);

  // --- Effects ---

  // 自动滚动到底部的 Effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- 函数定义 ---

  // 1. 音频播放函数
  const playAudio = (url) => {
    if (currentPlayingAudio) {
        currentPlayingAudio.pause();
        currentPlayingAudio.currentTime = 0;
        setCurrentPlayingAudio(null);
    }

    const audio = new Audio(`http://127.0.0.1:5000${url}`);

    setCurrentPlayingAudio(audio);

    audio.play()
        .catch(e => {
            console.error("播放音频失败:", e);
        });

    // 播放结束后清理状态
    audio.onended = () => {
        setCurrentPlayingAudio(null);
    };
  };

  // 2. 文本输入框变化处理函数 (关键：每次输入都会更新状态，驱动输入框显示最新内容)
  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  // 3. 文本发送函数
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const textToSend = inputText.trim();
    if (isLoading || isRecording || !textToSend) return;

    // 在发送前清空输入框，同时设置加载状态
    setInputText('');
    setIsLoading(true);

    // 1. 添加用户文本消息 (使用原始输入文本，而不是清空后的状态)
    const userMessage = { role: 'user', content: textToSend, audioUrl: null };
    setMessages(prev => [...prev, userMessage]);

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToSend,
                session_id: sessionId,
                target_role: targetRole,
            }),
        });

        if (!response.ok) {
            const errorDetails = await response.json().catch(() => ({ error: '未知错误' }));
            throw new Error(`HTTP 错误! 状态码: ${response.status}. 详情: ${errorDetails.error || JSON.stringify(errorDetails)}`);
        }

        const data = await response.json();

        // 2. 添加 AI 回复消息
        const aiResponse = {
            role: data.role,
            content: data.text,
            audioUrl: data.audio_url
        };
        setMessages(prev => [...prev, aiResponse]);

        // 3. 自动播放 AI 的回复
        if (data.audio_url) {
            playAudio(data.audio_url);
        }

    } catch (error) {
        console.error('文本发送/处理失败:', error);
        // 移除最后一条用户消息，并显示错误提示
        setMessages(prev => prev.slice(0, -1));
        setMessages(prev => [...prev, { role: 'narrator', content: `[文本发送失败] ${error.message}`, audioUrl: null }]);

    } finally {
        setIsLoading(false);
    }
  };


  // 4. 语音上传函数 (主要用于 STT)
  const uploadAudioForSTT = async (audioBlob) => {
    setIsLoading(true);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio_input.webm');
    formData.append('session_id', sessionId);
    formData.append('target_role', targetRole);

    // 模拟用户消息并添加到界面（占位符）
    const userMessagePlaceholder = { role: 'user', content: `[正在识别语音...]`, audioUrl: null };
    setMessages(prev => [...prev, userMessagePlaceholder]);

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorDetails = await response.json().catch(() => ({ error: '未知错误' }));
            throw new Error(`HTTP 错误! 状态码: ${response.status}. 详情: ${errorDetails.error || JSON.stringify(errorDetails)}`);
        }

        const data = await response.json();

        // 1. 更新最后一条消息（用户发送的占位符）
        setMessages(prev => {
            const updatedMessages = [...prev];
            updatedMessages[updatedMessages.length - 1] = {
                role: 'user',
                content: data.user_text || "[语音识别失败，请重试]",
                audioUrl: null
            };

            // 如果 AI 有回复，添加 AI 回复消息
            if (data.text && data.text !== data.user_text) {
                const aiResponse = {
                    role: data.role,
                    content: data.text,
                    audioUrl: data.audio_url
                };
                return [...updatedMessages, aiResponse];
            }
            return updatedMessages;
        });

        // 2. 自动播放 AI 的回复
        if (data.audio_url) {
            playAudio(data.audio_url);
        }

    } catch (error) {
        console.error('语音发送/处理失败:', error);
        setMessages(prev => {
             const updatedMessages = [...prev];
             updatedMessages[updatedMessages.length - 1] = {
                 ...updatedMessages[updatedMessages.length - 1],
                 content: `[语音处理失败] ${error.message}`
             };
             return updatedMessages;
        });

    } finally {
        setIsLoading(false);
    }
  };


  // 5. 录音/停止函数
  const startRecording = async () => {
      try {
          if (!navigator.mediaDevices || !window.MediaRecorder) {
              // 注意：避免使用 alert()，但为了简洁仍保留
              console.error('您的浏览器不支持录音功能。');
              return;
          }

          // 录音时禁用文本输入
          setInputText('');

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

          audioChunksRef.current = [];

          recorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
              }
          };

          recorder.onstop = () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              audioChunksRef.current = [];

              uploadAudioForSTT(audioBlob);
          };

          recorder.start();
          setMediaRecorder(recorder);
          setIsRecording(true);
      } catch (err) {
          console.error('获取麦克风失败:', err);
      }
  };

  const stopRecording = () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
      }
  };

  const handleMicClick = () => {
      if (isLoading) return;

      if (isRecording) {
          stopRecording();
      } else {
          startRecording();
      }
  };

  // 6. 渲染聊天气泡
  const renderMessage = (msg, index) => {
    const isUser = msg.role === 'user';
    const isAiMessage = !isUser;

    // 根据角色 ID 映射为中文名称
    const roleName = {
      'narrator': '引导者',
      'characterA': '李明 (侦探)',
      'characterB': '王芳 (妹妹)',
      'user': '你'
    }[msg.role] || '系统';

    const isPlaying = isAiMessage && currentPlayingAudio && currentPlayingAudio.src.endsWith(msg.audioUrl);

    return (
      <div
        key={index}
        className={`message-row ${isUser ? 'user-row' : 'ai-row'}`}
      >
        <div className={`message-bubble ${msg.role}`}>
          <div className="message-role-name">{roleName}</div>
          <p>{msg.content}</p>

          {/* 音频播放按钮 */}
          {isAiMessage && msg.audioUrl && (
            <button
              className="audio-play-button"
              onClick={() => playAudio(msg.audioUrl)}
              disabled={isLoading || isPlaying}
            >
              {isPlaying ? '⏸️ 播放中...' : '🔊 播放语音'}
            </button>
          )}

        </div>
      </div>
    );
  };


  // --- 组件渲染 (Return) ---

  return (
    <div className="chat-container">
      <div className="messages-area">
        {messages.map(renderMessage)}
        {isLoading && <div className="loading-indicator">AI 正在思考...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* 角色选择区域 (关键渲染部分) */}
      <div className="role-selection-area">
        <label htmlFor="target-role-select">下一个回复目标:</label>
        <select
          id="target-role-select"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          disabled={isLoading || isRecording}
        >
          {AI_ROLES.map(role => (
            <option key={role.value} value={role.value}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      {/* 输入区域：支持文本输入和语音输入 */}
      <form className="input-area" onSubmit={handleSendMessage}>
        {/* 文本输入框 (确保 value={inputText} 正确绑定，并且 disabled 逻辑清晰) */}
        <input
          type="text"
          value={inputText} // 确保输入框值与状态同步
          onChange={handleInputChange} // 确保每次输入都更新状态
          placeholder="输入文本或点击麦克风按钮..."
          disabled={isLoading || isRecording}
        />

        {/* 发送按钮 (启用) */}
        <button
          type="submit"
          disabled={isLoading || isRecording || !inputText.trim()}
          title="发送文本消息"
        >
          发送
        </button>

        {/* 麦克风按钮 (语音输入) */}
        <button
          type="button"
          className={`mic-button ${isRecording ? 'recording' : ''}`}
          onClick={handleMicClick}
          disabled={isLoading}
          title={isRecording ? '停止录音' : '开始录音'}
        >
          {isRecording ? '🔴' : '🎤'}
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;