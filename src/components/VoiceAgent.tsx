// src/components/VoiceAgent.tsx

import React from "react";
import { Box, Typography, Alert, Button } from "@mui/material";
import { useVoiceAgent } from "../hooks/useVoiceAgent";
import { StatusPanel } from "./StatusPanel";
import { ControlButtons } from "./ControlButtons";
import { MessageList } from "./MessageList";

const VoiceAgent: React.FC = () => {
  /// 상태관리할 값들
  const {
    // appState -> 앱의 상태 정보 (연결 상태, 오류 메시지 등)
    appState,
    // messages -> 대화 메시지 목록
    messages,
    // isInitialized -> 앱이 초기화되었는지 여부
    isInitialized,
    // isRecordingState -> 현재 음성 녹음 상태
    isRecordingState,
    // 음성 녹음 시작 함수
    startListening,
    // 음성 녹음 중지 함수
    stopListening,
    // 메시지 목록 초기화 함수
    clearMessages,
    // 서비스 재시작 함수
    restartServices,
    // 대화 통계 로깅 함수
    logConversationStats,
    updateAppState,
  } = useVoiceAgent();

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: 3, minHeight: "100vh" }}>
      {/* 헤더 */}
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 300 }}
        >
          🎤 Waldlust AI 주문 앱
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          OpenAI Realtime API를 사용한 실시간 음성 대화
        </Typography>
      </Box>

      {/* 상태 패널 */}
      <StatusPanel appState={appState} isRecordingState={isRecordingState} />

      {/* 오류 메시지 */}
      {appState.error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => updateAppState({ error: null })}
          action={
            <Button color="inherit" size="small" onClick={restartServices}>
              재시도
            </Button>
          }
        >
          {appState.error}
        </Alert>
      )}

      {/* 초기화 안내 */}
      {!isInitialized && (
        <Alert severity="info" sx={{ mb: 3 }}>
          앱을 초기화 중입니다. 문제가 지속되면 잠시 후 다시 시도하거나 재시작
          버튼을 눌러주세요.
        </Alert>
      )}

      {/* 컨트롤 버튼 
      버튼 Row에 각 상태 주입 
      */}
      <ControlButtons
        appState={appState}
        isInitialized={isInitialized}
        isRecordingState={isRecordingState}
        startListening={startListening}
        stopListening={stopListening}
        clearMessages={clearMessages}
        restartServices={restartServices}
        logConversationStats={logConversationStats}
        messagesLength={messages.length}
      />

      {/* 대화 기록 */}
      <MessageList messages={messages} />

      {/* 하단 정보 */}
      <Box sx={{ mt: 3, textAlign: "center" }}>
        <Typography variant="caption" color="text.secondary">
          Powered by OpenAI Realtime API • 실시간 음성 대화 지원
        </Typography>
      </Box>
    </Box>
  );
};

export default VoiceAgent;
