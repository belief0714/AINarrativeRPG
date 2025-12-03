🎭 无限叙事 AI 剧本杀 (AI Narrative RPG)

简介

本项目是一个基于 大型语言模型 (LLM) 和 语音/文本转换技术 (TTS/STT) 构建的沉浸式 AI 叙事互动平台。它旨在为用户提供一个高度自由、多角色参与的剧本杀或角色扮演体验，用户可以通过文本或语音与不同的 AI 角色进行实时对话，共同推动故事发展。

本项目采用前后端分离的架构，结构清晰。

💡 核心功能

多角色互动： 用户可以自由选择与 "引导者"、"侦探" 等不同 AI 角色进行对话，每个角色都具有独立的性格和背景设定。

双向语音支持：

语音转文本 (STT)： 用户通过麦克风输入语音，实时转换为文本。

文本转语音 (TTS)： AI 的回复将自动生成语音并播放。

实时聊天界面： 现代化、炫酷的深色 UI 界面，提供流畅的聊天体验。

连贯叙事： 维护会话历史，确保 AI 角色能够记住上下文并保持连贯的剧情。

🛠️ 技术栈与项目结构

本项目结构清晰，所有代码都位于根目录下的两个子文件夹中：

/leishi          <-- 项目根目录
├── ai-rpg-backend  <-- 后端服务 (Python/Flask)
└── ai-rpg-frontend <-- 前端应用 (React)


组件

目录

核心技术

职责

前端

ai-rpg-frontend

React, CSS/HTML

用户界面、语音输入、消息展示。

后端

ai-rpg-backend

Python (或其他)

逻辑处理、API Key管理、调用 LLM 和 TTS/STT 服务。

🚀 启动指南

1. 先决条件

安装 Node.js (用于前端 ai-rpg-frontend)。

安装 Python 3.x (用于后端 ai-rpg-backend)。

获取 LLM 和语音 API Key（例如 Google Gemini API Key）。

2. 后端启动 (ai-rpg-backend)

进入后端目录：

cd ai-rpg-backend


创建并激活 Python 虚拟环境：

python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 .venv/Scripts/activate for Windows


安装依赖（确保您有 requirements.txt）：

pip install -r requirements.txt


设置 API 密钥（将 YOUR_API_KEY 替换为实际密钥）：

export GEMINI_API_KEY="YOUR_API_KEY"


启动后端服务：

python app.py  # 或您的后端启动文件


3. 前端启动 (ai-rpg-frontend)

回到项目根目录，进入前端目录：

cd ../ai-rpg-frontend


安装 Node.js 依赖：

npm install


启动前端应用：

npm start


应用通常会在 http://localhost:3000 启动。

🤝 贡献

欢迎对本项目提出建议和代码贡献！请随时提交 Pull Request 或 Issue。
