// src/hooks/useVoiceAgent.ts

import { useState, useRef, useCallback, useEffect } from "react";
import { OpenAIWebSocketService } from "../services/OpenAIWebSocketService";
import { AudioService } from "../services/AudioService";
// 타입 임포트 수정
import type {
  ConnectionStatus,
  OpenAIEventHandlers,
  JsonObject,
} from "../types/openai-types";

// 메시지 인터페이스
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// 앱 상태 인터페이스
export interface AppState {
  connectionStatus: ConnectionStatus;
  isListening: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  error: string | null;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

export const useVoiceAgent = () => {
  // 상태 관리
  const [appState, setAppState] = useState<AppState>({
    connectionStatus: "disconnected",
    isListening: false,
    isProcessing: false,
    currentTranscript: "",
    error: null,
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecordingState, setIsRecordingState] = useState(false);

  // 서비스 참조
  const wsServiceRef = useRef<OpenAIWebSocketService | null>(null);
  const audioServiceRef = useRef<AudioService | null>(null);
  const initializationRef = useRef<boolean>(false);

  // 상태 업데이트 헬퍼
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

      if (role === "user") {
        console.log("👤 사용자 메시지:", content, `(${content.length}글자)`);
      } else if (role === "assistant") {
        console.log("🤖 AI 메시지:", content, `(${content.length}글자)`);
      }

      setMessages((prev) => [...prev, newMessage]);
    },
    []
  );

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

      if (lastMessage?.role === "assistant" && lastMessage.isStreaming) {
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

  // WebSocket 이벤트 핸들러 (타입 수정)
  const createEventHandlers = useCallback(
    (): OpenAIEventHandlers => ({
      sessionCreated: () => {
        console.log("✅ 세션 생성됨");
        updateAppState({ connectionStatus: "connected" });
      },

      speechStarted: () => {
        console.log("🎤 음성 감지 시작");
        updateAppState({ isListening: true });
      },

      speechStopped: () => {
        console.log("🛑 음성 감지 중지");
        updateAppState({ isListening: false });
        wsServiceRef.current?.commitAudioBuffer();
      },

      inputAudioTranscriptionDelta: (data: JsonObject) => {
        const delta = data.delta as string;
        if (delta && typeof delta === "string") {
          setAppState((prev) => ({
            ...prev,
            currentTranscript: prev.currentTranscript + delta,
          }));
        }
      },

      inputAudioTranscriptionCompleted: (data: JsonObject) => {
        const transcript = data.transcript as string;
        if (transcript?.trim()) {
          console.log("🗣️ 음성 인식 완료:", transcript);
          addMessage("user", transcript);
          updateAppState({
            currentTranscript: "",
            isProcessing: true,
          });
        }
      },

      responseAudioDelta: (data: JsonObject) => {
        const audioDelta = data.delta as string;
        if (audioDelta && audioServiceRef.current) {
          audioServiceRef.current.playAudio(audioDelta);
        }
      },

      responseAudioTranscriptDelta: (data: JsonObject) => {
        const textDelta = data.delta as string;
        if (textDelta) {
          updateLastAssistantMessage(textDelta);
        }
      },

      responseDone: () => {
        console.log("✅ 응답 완료");
        updateAppState({ isProcessing: false });
      },

      onError: (error: Event) => {
        console.error("❌ WebSocket 오류:", error);
        updateAppState({
          connectionStatus: "error",
          error: "연결 오류가 발생했습니다.",
        });
      },

      onClose: () => {
        console.log("🔴 연결 종료");
        updateAppState({ connectionStatus: "disconnected" });
      },
    }),
    [updateAppState, addMessage, updateLastAssistantMessage]
  );

  // 리소스 정리
  const cleanup = useCallback((): void => {
    console.log("🧹 리소스 정리 시작");

    if (audioServiceRef.current) {
      audioServiceRef.current.cleanup();
      audioServiceRef.current = null;
    }

    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
      wsServiceRef.current = null;
    }

    setIsInitialized(false);
    setIsRecordingState(false);
    console.log("✅ 리소스 정리 완료");
  }, []);

  // 초기화
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    let isMounted = true;

    const initialize = async () => {
      try {
        console.log("🚀 VoiceAgent 초기화 시작");
        updateAppState({ connectionStatus: "connecting", error: null });

        // 오디오 서비스 초기화
        console.log("⚙️ 오디오 서비스 초기화 시작");
        audioServiceRef.current = new AudioService();
        await audioServiceRef.current.initializeAudio();
        console.log("✅ 오디오 서비스 초기화 완료");

        if (!isMounted) {
          console.log("⚠️ 컴포넌트가 언마운트되어 초기화 중단");
          return;
        }

        // WebSocket 서비스 초기화
        console.log("🌐 WebSocket 서비스 초기화 시작");
        wsServiceRef.current = new OpenAIWebSocketService(
          {
            apiKey: OPENAI_API_KEY,
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
            inputAudioFormat: "pcm16",
            outputAudioFormat: "pcm16",
          },
          createEventHandlers() // 함수명 변경
        );

        console.log("🔗 WebSocket 연결 시도");
        await wsServiceRef.current.connect();
        console.log("✅ WebSocket 연결 완료");

        if (!isMounted) {
          console.log("⚠️ 컴포넌트가 언마운트되어 초기화 중단");
          return;
        }

        setIsInitialized(true);
        console.log("🎉 모든 서비스 초기화 완료");
        addSystemMessage("음성 비서가 준비되었습니다.");
      } catch (error) {
        console.error("❌ 초기화 실패:", error);
        if (isMounted) {
          updateAppState({
            connectionStatus: "error",
            error: "서비스 초기화에 실패했습니다.",
          });
        }
      }
    };

    initialize();

    return () => {
      console.log("🧹 VoiceAgent 정리 시작");
      isMounted = false;
      cleanup();
    };
  }, [createEventHandlers, updateAppState, addSystemMessage, cleanup]);

  // 음성 인식 시작
  const startListening = useCallback((): void => {
    console.log("🎯 음성 인식 시작");
    setIsRecordingState(true);

    if (!audioServiceRef.current || !wsServiceRef.current || !isInitialized) {
      updateAppState({ error: "서비스가 준비되지 않았습니다." });
      setIsRecordingState(false);
      return;
    }

    if (appState.connectionStatus !== "connected") {
      updateAppState({ error: "서버 연결이 완료되지 않았습니다." });
      setIsRecordingState(false);
      return;
    }

    try {
      updateAppState({ error: null });

      let audioChunkCount = 0;
      audioServiceRef.current.startStreaming((audioData: string) => {
        audioChunkCount++;
        if (audioChunkCount % 10 === 0) {
          console.log(`📦 오디오 청크 #${audioChunkCount}`);
        }
        wsServiceRef.current?.sendAudio(audioData);
      });
    } catch (err) {
      console.error("❌ 음성 인식 시작 실패:", err);
      updateAppState({ error: "음성 인식을 시작할 수 없습니다." });
      setIsRecordingState(false);
    }
  }, [isInitialized, appState.connectionStatus, updateAppState]);

  // 음성 인식 중지
  const stopListening = useCallback((): void => {
    console.log("⏹️ 음성 인식 중지");
    setIsRecordingState(false);
    audioServiceRef.current?.stopStreaming();
  }, []);

  // 대화 초기화
  const clearMessages = useCallback((): void => {
    console.log("🗑️ 대화 기록 초기화");
    setMessages([]);
    updateAppState({ currentTranscript: "", error: null });
    addSystemMessage("대화 기록이 초기화되었습니다.");
  }, [updateAppState, addSystemMessage]);

  // 서비스 재시작
  const restartServices = useCallback((): void => {
    console.log("🔄 서비스 재시작");
    window.location.reload();
  }, []);

  // 대화 통계
  const logConversationStats = useCallback(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    const aiMessages = messages.filter((m) => m.role === "assistant");

    console.log("📈 대화 통계:");
    console.log("- 사용자 발화:", userMessages.length);
    console.log("- AI 응답:", aiMessages.length);
    console.log(
      "- 총 대화 턴:",
      Math.min(userMessages.length, aiMessages.length)
    );
  }, [messages]);

  return {
    // 상태
    appState,
    messages,
    isInitialized,
    isRecordingState,

    // 액션
    startListening,
    stopListening,
    clearMessages,
    restartServices,
    logConversationStats,

    // 헬퍼
    updateAppState,
  };
};
