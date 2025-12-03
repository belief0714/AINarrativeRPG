import React from 'react';
import ChatInterface from './ChatInterface';
import './App.css'; // 确保 App.css 存在或创建

function App() {
  return (
    <div className="app-container">
      <h1>无限叙事AI剧本杀</h1>
      <ChatInterface />
    </div>
  );
}

export default App;