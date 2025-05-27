// src/components/StatusPanel.tsx

import React from "react";
import { Box, Typography, Paper, Chip, CircularProgress } from "@mui/material";
import { Mic } from "@mui/icons-material";
import type { AppState } from "../hooks/useVoiceAgent";

interface StatusPanelProps {
  appState: AppState;
  isRecordingState: boolean;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  appState,
  isRecordingState,
}) => {
  const getConnectionStatusColor = ():
    | "success"
    | "error"
    | "warning"
    | "info" => {
    switch (appState.connectionStatus) {
      case "connected":
        return "success";
      case "connecting":
        return "info";
      case "error":
        return "error";
      default:
        return "warning";
    }
  };

  const getConnectionStatusText = (): string => {
    switch (appState.connectionStatus) {
      case "connected":
        return "🟢 연결됨";
      case "connecting":
        return "🟡 연결 중...";
      case "error":
        return "🔴 연결 오류";
      default:
        return "⚪ 연결 안됨";
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography variant="h6">연결 상태</Typography>
        <Chip
          label={getConnectionStatusText()}
          color={getConnectionStatusColor()}
          variant="outlined"
        />
      </Box>

      <Box
        sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}
      >
        {appState.isListening && (
          <Chip
            icon={<Mic />}
            label="🎧 듣고 있습니다..."
            color="primary"
            variant="filled"
          />
        )}

        {appState.isProcessing && (
          <Chip
            icon={<CircularProgress size={16} />}
            label="🤔 처리 중..."
            color="secondary"
            variant="filled"
          />
        )}

        {isRecordingState && (
          <Chip label="🔴 녹음 중" color="error" variant="filled" />
        )}
      </Box>

      {appState.currentTranscript && (
        <Box sx={{ mt: 2, p: 2, bgcolor: "grey.100", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontStyle: "italic" }}>
            실시간 인식: "{appState.currentTranscript}"
          </Typography>
        </Box>
      )}
    </Paper>
  );
};
