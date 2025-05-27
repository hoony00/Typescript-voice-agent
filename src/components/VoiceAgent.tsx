// src/components/VoiceAgent.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Divider,
} from "@mui/material";
import { Mic, MicOff, Clear, Refresh } from "@mui/icons-material";

import { OpenAIWebSocketService } from "../services/OpenAIWebSocketService";
import type {
  ConnectionStatus,
  OpenAIEventHandlers,
} from "../types/openai-types";

import { AudioService } from "../services/AudioService";
import type { JsonObject } from "../types/openai-types";

// OpenAI API 키 설정
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

if (!OPENAI_API_KEY) {
  console.error("❌ OpenAI API 키가 설정되지 않았습니다.");
}

// 메시지 인터페이스
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// 앱 상태 인터페이스
interface AppState {
  connectionStatus: ConnectionStatus;
  isListening: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  error: string | null;
}

const VoiceAgent: React.FC = () => {
  // 상태 관리
  const [appState, setAppState] = useState<AppState>({
    connectionStatus: "disconnected",
    isListening: false,
    isProcessing: false,
    currentTranscript: "",
    error: null,
  });

  // 메시지 목록 상태
  const [messages, setMessages] = useState<Message[]>([]);
  // 초기화 상태
  const [isInitialized, setIsInitialized] = useState(false);

  // 서비스 참조
  const wsServiceRef = useRef<OpenAIWebSocketService | null>(null);
  const audioServiceRef = useRef<AudioService | null>(null);

  // 초기화 관련 ref들
  const initializationRef = useRef<boolean>(false);
  const cleanupRef = useRef<boolean>(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // 상태 업데이트 헬퍼 함수
  const updateAppState = useCallback((updates: Partial<AppState>): void => {
    setAppState((prev) => ({ ...prev, ...updates }));
  }, []);

  // 메시지 추가
  const addMessage = useCallback(
    (role: "user" | "assistant" | "system", content: string): void => {
      const newMessage: Message = {
        id: `${Date.now()}-${Math.random()}`,
        role,
        content,
        timestamp: new Date(),
        isStreaming: role === "assistant",
      };

      // 상세 로깅 추가
      if (role === "user") {
        console.log("👤 사용자 메시지 추가:");
        console.log("- 내용:", content);
        console.log("- 길이:", content.length, "글자");
        console.log("- 시간:", newMessage.timestamp.toLocaleTimeString());
      } else if (role === "assistant") {
        console.log("🤖 AI 메시지 추가:");
        console.log("- 내용:", content);
        console.log("- 길이:", content.length, "글자");
        console.log("- 시간:", newMessage.timestamp.toLocaleTimeString());
      }

      setMessages((prev) => [...prev, newMessage]);
    },
    []
  );

  // 시스템 메시지 추가
  const addSystemMessage = useCallback(
    (content: string): void => {
      addMessage("system", content);
    },
    [addMessage]
  );

  // 어시스턴트 메시지 실시간 업데이트
  const updateLastAssistantMessage = useCallback((delta: string): void => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];

      if (
        lastMessage &&
        lastMessage.role === "assistant" &&
        lastMessage.isStreaming
      ) {
        lastMessage.content += delta;
      } else {
        newMessages.push({
          id: `${Date.now()}-${Math.random()}`,
          role: "assistant",
          content: delta,
          timestamp: new Date(),
          isStreaming: true,
        });
      }

      return newMessages;
    });
  }, []);

  // 실제 초기화 수행 함수
  const performInitialization = useCallback(async (): Promise<void> => {
    try {
      console.log("⚙️ 서비스 초기화 시작");
      updateAppState({ connectionStatus: "connecting", error: null });

      // 단계별 초기화 with 중단 체크
      if (cleanupRef.current) {
        console.log("⚠️ 초기화 중 정리 신호 감지, 중단");
        return;
      }

      // 1. 오디오 서비스 초기화
      console.log("🎵 오디오 서비스 초기화");
      audioServiceRef.current = new AudioService();
      await audioServiceRef.current.initializeAudio();

      if (cleanupRef.current) {
        console.log("⚠️ 오디오 초기화 후 정리 신호 감지");
        audioServiceRef.current.cleanup();
        audioServiceRef.current = null;
        return;
      }

      console.log("✅ 오디오 서비스 초기화 완료");

      // 2. WebSocket 이벤트 핸들러 설정
      const eventHandlers: OpenAIEventHandlers = {
        sessionCreated: (data: JsonObject) => {
          console.log("✅ 세션 생성됨:", data);
          updateAppState({ connectionStatus: "connected" });
        },

        speechStarted: (data: JsonObject) => {
          console.log("🎤 음성 감지 시작:", data);
          updateAppState({ isListening: true });
        },

        speechStopped: (data: JsonObject) => {
          console.log("🛑 음성 감지 중지:", data);
          updateAppState({ isListening: false });
          wsServiceRef.current?.commitAudioBuffer();
        },

        inputAudioTranscriptionDelta: (data: JsonObject) => {
          const delta = data.delta as string;
          if (delta && typeof delta === "string") {
            console.log("📝 실시간 음성 인식 텍스트:", delta);
            setAppState((prev) => ({
              ...prev,
              currentTranscript: prev.currentTranscript + delta,
            }));
          }
        },

        inputAudioTranscriptionCompleted: (data: JsonObject) => {
          const transcript = data.transcript as string;
          if (
            transcript &&
            typeof transcript === "string" &&
            transcript.trim()
          ) {
            console.log("🗣️ 사용자 음성 인식 완료:", transcript);
            console.log("📊 사용자 발화 길이:", transcript.length, "글자");
            addMessage("user", transcript);
            updateAppState({
              currentTranscript: "",
              isProcessing: true,
            });
          }
        },

        responseAudioDelta: (data: JsonObject) => {
          const audioDelta = data.delta as string;
          if (
            audioDelta &&
            typeof audioDelta === "string" &&
            audioServiceRef.current
          ) {
            console.log("🔊 AI 음성 응답 수신:", audioDelta.length, "bytes");
            audioServiceRef.current.playAudio(audioDelta);
          }
        },

        responseAudioTranscriptDelta: (data: JsonObject) => {
          const textDelta = data.delta as string;
          if (textDelta && typeof textDelta === "string") {
            console.log("💬 AI 텍스트 응답:", textDelta);
            updateLastAssistantMessage(textDelta);
          }
        },

        responseAudioTranscriptDone: (data: JsonObject) => {
          const finalTranscript = data.transcript as string;
          if (finalTranscript) {
            console.log("✅ AI 응답 텍스트 완료:", finalTranscript);
            console.log("📊 AI 응답 길이:", finalTranscript.length, "글자");
          }
        },

        responseDone: (data: JsonObject) => {
          console.log("✅ 응답 완료:", data);
          updateAppState({ isProcessing: false });
        },

        onError: (error: Event) => {
          console.error("❌ WebSocket 오류:", error);
          updateAppState({
            connectionStatus: "error",
            error: "연결 오류가 발생했습니다.",
          });
        },

        onClose: (event: CloseEvent) => {
          console.log("🔴 연결 종료:", event);
          updateAppState({ connectionStatus: "disconnected" });
        },
      };

      if (cleanupRef.current) {
        console.log("⚠️ 이벤트 핸들러 설정 후 정리 신호 감지");
        return;
      }

      // 3. WebSocket 서비스 초기화
      console.log("🌐 WebSocket 서비스 초기화");
      wsServiceRef.current = new OpenAIWebSocketService(
        {
          apiKey: OPENAI_API_KEY,
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
          inputAudioFormat: "pcm16",
          outputAudioFormat: "pcm16",
        },
        eventHandlers
      );

      if (cleanupRef.current) {
        console.log("⚠️ WebSocket 서비스 생성 후 정리 신호 감지");
        wsServiceRef.current.disconnect();
        wsServiceRef.current = null;
        return;
      }

      // 4. WebSocket 연결
      console.log("🔗 WebSocket 연결 시도");
      await wsServiceRef.current.connect();

      if (cleanupRef.current) {
        console.log("⚠️ WebSocket 연결 후 정리 신호 감지");
        wsServiceRef.current.disconnect();
        wsServiceRef.current = null;
        return;
      }

      console.log("✅ WebSocket 연결 완료");

      // 5. 초기화 완료 처리
      if (!cleanupRef.current) {
        setIsInitialized(true);
        console.log("🎉 모든 서비스 초기화 완료");
        console.log("- audioServiceRef.current:", !!audioServiceRef.current);
        console.log("- wsServiceRef.current:", !!wsServiceRef.current);
        console.log("- isInitialized 설정됨: true");
        addSystemMessage("음성 비서가 준비되었습니다.");
      }
    } catch (err) {
      if (!cleanupRef.current) {
        console.error("❌ 초기화 실패:", err);
        let errorMessage = "서비스 초기화에 실패했습니다.";

        if (err instanceof Error) {
          if (err.message.includes("API")) {
            errorMessage = "OpenAI API 키를 확인해주세요.";
          } else if (err.message.includes("마이크")) {
            errorMessage = "마이크 권한을 허용해주세요.";
          }
        }

        updateAppState({
          connectionStatus: "error",
          error: errorMessage,
        });
      }
    }
  }, [
    updateAppState,
    addMessage,
    addSystemMessage,
    updateLastAssistantMessage,
  ]);

  // 서비스 초기화 (중복 실행 방지)
  const initializeServices = useCallback(async (): Promise<void> => {
    // 이미 초기화 중이면 기존 Promise 반환
    if (initPromiseRef.current) {
      console.log("⚠️ 이미 초기화 중입니다. 기존 초기화를 기다립니다.");
      return initPromiseRef.current;
    }

    // 정리된 상태라면 초기화하지 않음
    if (cleanupRef.current) {
      console.log("⚠️ 컴포넌트가 정리된 상태이므로 초기화 건너뜀");
      return;
    }

    // 초기화 Promise 생성
    initPromiseRef.current = performInitialization();

    try {
      await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  }, [performInitialization]);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // 중복 실행 방지
    if (initializationRef.current) {
      console.log("⚠️ 이미 초기화가 시작되었습니다.");
      return;
    }

    initializationRef.current = true;
    cleanupRef.current = false;

    console.log("🚀 VoiceAgent 초기화 시작");

    // React StrictMode 이중 렌더링 회피를 위한 지연
    const initTimer = setTimeout(() => {
      if (!cleanupRef.current) {
        initializeServices();
      }
    }, 100);

    return () => {
      console.log("🧹 VoiceAgent 정리 시작");
      clearTimeout(initTimer);
      cleanupRef.current = true;
      cleanup();
    };
  }, [initializeServices]);

  // 음성 인식 시작
  const startListening = useCallback((): void => {
    console.log("🎯 startListening 함수 호출됨");

    // 정리된 상태 확인
    if (cleanupRef.current) {
      console.log("⚠️ 컴포넌트가 정리된 상태입니다");
      return;
    }

    // 상세한 상태 체크
    console.log("🔍 서비스 상태 체크:");
    console.log("- audioServiceRef.current:", !!audioServiceRef.current);
    console.log("- wsServiceRef.current:", !!wsServiceRef.current);
    console.log("- isInitialized:", isInitialized);
    console.log("- connectionStatus:", appState.connectionStatus);

    // 초기화가 진행 중인지 확인
    if (appState.connectionStatus === "connecting") {
      console.log("⚠️ 아직 초기화 중입니다. 잠시 후 다시 시도해주세요.");
      updateAppState({ error: "초기화 중입니다. 잠시만 기다려주세요." });
      return;
    }

    // ref가 null인 경우 재초기화 시도
    if (!audioServiceRef.current && isInitialized) {
      console.log("⚠️ audioServiceRef가 null입니다. 재초기화를 시도합니다.");
      updateAppState({ error: "서비스를 재초기화하고 있습니다..." });

      // 재초기화
      initializationRef.current = false;
      cleanupRef.current = false;
      setIsInitialized(false);
      initializeServices();
      return;
    }

    // 개별 조건 체크
    if (!audioServiceRef.current) {
      console.log("❌ audioServiceRef.current가 null입니다");
      updateAppState({ error: "오디오 서비스가 초기화되지 않았습니다." });
      return;
    }

    if (!wsServiceRef.current) {
      console.log("❌ wsServiceRef.current가 null입니다");
      updateAppState({ error: "WebSocket 서비스가 초기화되지 않았습니다." });
      return;
    }

    if (!isInitialized) {
      console.log("❌ isInitialized가 false입니다");
      updateAppState({ error: "서비스 초기화가 완료되지 않았습니다." });
      return;
    }

    // 추가 안전 체크
    if (appState.connectionStatus !== "connected") {
      console.log("❌ WebSocket이 연결되지 않았습니다");
      updateAppState({ error: "서버 연결이 완료되지 않았습니다." });
      return;
    }

    console.log("✅ 모든 조건 통과, 음성 인식 시작");

    try {
      updateAppState({ error: null });

      let audioChunkCount = 0;
      let totalAudioSize = 0;

      audioServiceRef.current.startStreaming((audioData: string) => {
        audioChunkCount++;
        totalAudioSize += audioData.length;

        // 로그 출력 빈도 제어 (5번에 1번만 출력)
        if (audioChunkCount % 5 === 0) {
          console.log(`📦 오디오 청크 #${audioChunkCount}:`, {
            size: audioData.length,
            totalSize: totalAudioSize,
            timestamp: new Date().toLocaleTimeString(),
          });
        }

        wsServiceRef.current?.sendAudio(audioData);
      });
      console.log("✅ startStreaming 호출 완료");
    } catch (err) {
      console.error("❌ 음성 인식 시작 실패:", err);
      updateAppState({ error: "음성 인식을 시작할 수 없습니다." });
    }
  }, [
    isInitialized,
    appState.connectionStatus,
    updateAppState,
    initializeServices,
  ]);

  // 음성 인식 중지
  const stopListening = useCallback((): void => {
    if (audioServiceRef.current) {
      console.log("⏹️ 음성 인식 중지");
      audioServiceRef.current.stopStreaming();
    }
  }, []);

  // 대화 초기화
  const clearMessages = useCallback((): void => {
    console.log("🗑️ 대화 기록 초기화");
    setMessages([]);
    updateAppState({ currentTranscript: "", error: null });
    addSystemMessage("대화 기록이 초기화되었습니다.");
  }, [updateAppState, addSystemMessage]);

  // 대화 통계 로깅
  const logConversationStats = useCallback(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    const aiMessages = messages.filter((m) => m.role === "assistant");

    console.log("📈 대화 통계:");
    console.log("- 사용자 발화 횟수:", userMessages.length);
    console.log("- AI 응답 횟수:", aiMessages.length);
    console.log(
      "- 총 대화 턴:",
      Math.min(userMessages.length, aiMessages.length)
    );

    if (userMessages.length > 0) {
      const avgUserLength =
        userMessages.reduce((sum, m) => sum + m.content.length, 0) /
        userMessages.length;
      console.log(
        "- 평균 사용자 발화 길이:",
        Math.round(avgUserLength),
        "글자"
      );
    }

    if (aiMessages.length > 0) {
      const avgAiLength =
        aiMessages.reduce((sum, m) => sum + m.content.length, 0) /
        aiMessages.length;
      console.log("- 평균 AI 응답 길이:", Math.round(avgAiLength), "글자");
    }
  }, [messages]);

  // 서비스 재시작
  const restartServices = useCallback(async (): Promise<void> => {
    console.log("🔄 서비스 재시작 시작");

    // 1. 기존 서비스 완전 정리
    cleanup();

    // 2. 상태 초기화
    setIsInitialized(false);
    updateAppState({
      connectionStatus: "disconnected",
      isListening: false,
      isProcessing: false,
      currentTranscript: "",
      error: null,
    });

    // 3. 플래그 리셋
    initializationRef.current = false;
    cleanupRef.current = false;

    // 4. 잠시 대기 후 재초기화
    setTimeout(() => {
      if (!cleanupRef.current) {
        console.log("🔄 재초기화 시작");
        initializeServices();
      }
    }, 500);
  }, [updateAppState, initializeServices]);

  // 리소스 정리
  const cleanup = useCallback((): void => {
    try {
      console.log("🧹 리소스 정리 시작");
      cleanupRef.current = true;

      // 초기화 Promise 정리
      if (initPromiseRef.current) {
        initPromiseRef.current = null;
      }

      if (audioServiceRef.current) {
        audioServiceRef.current.cleanup();
        audioServiceRef.current = null;
      }

      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
        wsServiceRef.current = null;
      }

      setIsInitialized(false);
      console.log("✅ 리소스 정리 완료");
    } catch (err) {
      console.error("❌ 정리 중 오류:", err);
    }
  }, []);

  // 연결 상태 색상
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
      case "disconnected":
      default:
        return "warning";
    }
  };

  // 연결 상태 텍스트
  const getConnectionStatusText = (): string => {
    switch (appState.connectionStatus) {
      case "connected":
        return "🟢 연결됨";
      case "connecting":
        return "🟡 연결 중...";
      case "error":
        return "🔴 연결 오류";
      case "disconnected":
      default:
        return "⚪ 연결 안됨";
    }
  };

  // 녹음 상태 확인
  const isRecording = (): boolean => {
    return audioServiceRef.current?.getRecordingStatus() || false;
  };

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
          🎤 AI 음성 비서
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          OpenAI Realtime API를 사용한 실시간 음성 대화
        </Typography>
      </Box>

      {/* 상태 패널 */}
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
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
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

          {isRecording() && (
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

      {/* 컨트롤 버튼 */}
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
          startIcon={isRecording() ? <MicOff /> : <Mic />}
          onClick={isRecording() ? stopListening : startListening}
          disabled={
            !audioServiceRef.current ||
            !wsServiceRef.current ||
            !isInitialized ||
            appState.connectionStatus !== "connected" ||
            appState.isProcessing
          }
          color={isRecording() ? "error" : "primary"}
          sx={{
            minWidth: 140,
            height: 56,
            borderRadius: 3,
            fontSize: "1.1rem",
            fontWeight: 600,
          }}
        >
          {isRecording() ? "중지" : "말하기"}
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
          disabled={appState.isProcessing}
          sx={{ minWidth: 100, height: 56, borderRadius: 3 }}
        >
          재시작
        </Button>

        {/* 디버깅용 버튼들 */}
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
            console.log(
              "- audioServiceRef.current:",
              !!audioServiceRef.current
            );
            console.log("- wsServiceRef.current:", !!wsServiceRef.current);
            console.log("- isInitialized:", isInitialized);
            console.log("- connectionStatus:", appState.connectionStatus);
            console.log("- cleanupRef.current:", cleanupRef.current);
            console.log("- initPromiseRef.current:", !!initPromiseRef.current);
            console.table(messages);
          }}
          sx={{ minWidth: 100, height: 56, borderRadius: 3 }}
        >
          🔍 상태확인
        </Button>
      </Box>

      {/* 대화 기록 */}
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
