// src/components/MessageList.tsx

import React from "react";
import { Box, Typography, Paper, Chip, Divider } from "@mui/material";
import type { Message } from "../hooks/useVoiceAgent";

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <Paper elevation={2} sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box
        sx={{
          p: 2,
          bgcolor: "grey.50",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h6"
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          💬 대화 기록
          <Chip label={`${messages.length}개`} size="small" />
        </Typography>
      </Box>

      <Box sx={{ maxHeight: 500, overflow: "auto", p: 2 }}>
        {messages.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="body1" color="text.secondary">
              🎙️ 음성 버튼을 눌러 대화를 시작하세요
            </Typography>
          </Box>
        ) : (
          messages.map((message, index) => (
            <Box key={message.id} sx={{ mb: 2 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor:
                    message.role === "user"
                      ? "primary.light"
                      : message.role === "assistant"
                      ? "grey.100"
                      : "info.light",
                  color:
                    message.role === "user"
                      ? "primary.contrastText"
                      : "text.primary",
                  maxWidth: "85%",
                  ml: message.role === "user" ? "auto" : 0,
                  mr: message.role === "user" ? 0 : "auto",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                    {message.role === "user"
                      ? "👤 나"
                      : message.role === "assistant"
                      ? "🤖 AI"
                      : "⚙️ 시스템"}
                  </Typography>
                  {message.isStreaming && (
                    <Chip
                      label="실시간"
                      size="small"
                      color="secondary"
                      sx={{ ml: 1, height: 20 }}
                    />
                  )}
                </Box>

                <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                  {message.content}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    opacity: 0.7,
                    display: "block",
                    mt: 1,
                    textAlign: message.role === "user" ? "right" : "left",
                  }}
                >
                  {message.timestamp.toLocaleTimeString("ko-KR")}
                </Typography>
              </Box>

              {index < messages.length - 1 && (
                <Divider sx={{ my: 1, opacity: 0.3 }} />
              )}
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
};
