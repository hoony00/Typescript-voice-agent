// src/components/ControlButtons.tsx

import React from "react";
import { Box, Button } from "@mui/material";
import { Mic, MicOff, Clear, Refresh } from "@mui/icons-material";
import type { AppState } from "../hooks/useVoiceAgent";

interface ControlButtonsProps {
  appState: AppState;
  isInitialized: boolean;
  isRecordingState: boolean;
  startListening: () => void;
  stopListening: () => void;
  clearMessages: () => void;
  restartServices: () => void;
  logConversationStats: () => void;
  messagesLength: number;
}

export const ControlButtons: React.FC<ControlButtonsProps> = ({
  appState,
  isInitialized,
  isRecordingState,
  startListening,
  stopListening,
  clearMessages,
  restartServices,
  logConversationStats,
  messagesLength,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        justifyContent: "center",
        mb: 4,
        flexWrap: "wrap",
      }}
    >
      <Button
        variant="contained"
        size="large"
        startIcon={isRecordingState ? <MicOff /> : <Mic />}
        onClick={isRecordingState ? stopListening : startListening}
        disabled={
          !isInitialized ||
          appState.connectionStatus !== "connected" ||
          appState.isProcessing
        }
        color={isRecordingState ? "error" : "primary"}
        sx={{
          minWidth: 140,
          height: 56,
          borderRadius: 3,
          fontSize: "1.1rem",
          fontWeight: 600,
        }}
      >
        {isRecordingState ? "중지" : "말하기"}
      </Button>

      <Button
        variant="outlined"
        startIcon={<Clear />}
        onClick={clearMessages}
        disabled={appState.isProcessing}
        sx={{ minWidth: 120, height: 56, borderRadius: 3 }}
      >
        대화 초기화
      </Button>

      <Button
        variant="outlined"
        startIcon={<Refresh />}
        onClick={restartServices}
        sx={{ minWidth: 100, height: 56, borderRadius: 3 }}
      >
        재시작
      </Button>

      <Button
        variant="outlined"
        onClick={logConversationStats}
        sx={{ minWidth: 100, height: 56, borderRadius: 3 }}
      >
        📊 통계
      </Button>

      <Button
        variant="outlined"
        onClick={() => {
          console.log("🔍 현재 상태 확인:");
          console.log("- isInitialized:", isInitialized);
          console.log("- connectionStatus:", appState.connectionStatus);
          console.log("- isRecordingState:", isRecordingState);
          console.log("- 메시지 수:", messagesLength);
        }}
        sx={{ minWidth: 100, height: 56, borderRadius: 3 }}
      >
        🔍 상태확인
      </Button>
    </Box>
  );
};
