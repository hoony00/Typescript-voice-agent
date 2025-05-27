/**
 * ============================================================================
 * OpenAI Realtime API TypeScript 타입 정의
 * ============================================================================
 *
 * 역할: TypeScript 타입 정의 및 인터페이스 관리
 *  1. 기본 JSON 타입 → 2. 오디오 → 3. 세션 → 4. 이벤트 → 5. 설정 → 6. 유틸리티

 * 주요 기능:
 * - JsonValue 타입: OpenAI API 응답 데이터의 기본 타입 정의
 * - JsonObject 인터페이스: JSON 객체 구조 타입 정의
 * - JsonArray 타입: JSON 배열 구조 타입 정의
 * - AudioConfig 인터페이스: 오디오 설정 매개변수 정의
 * - SessionConfig 인터페이스: OpenAI 세션 설정 구조 정의
 * - ConversationItem 인터페이스: 대화 아이템 구조 정의
 *
 * 사용 목적:
 * - 프로젝트 전체의 타입 안정성 보장
 * - OpenAI API 응답 구조 표준화
 * - 컴파일 타임 오류 방지
 * - IDE 자동완성 및 타입 체크 지원
 *
 * 참조: OpenAI API Reference (https://platform.openai.com/docs/api-reference)
 * ============================================================================
 */

// ============================================================================
// 1. 기본 JSON 타입 정의
// ============================================================================

/**
 * OpenAI API 응답 데이터의 기본 타입 정의
 * 모든 JSON 값이 가질 수 있는 타입들을 포함
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

/**
 * JSON 객체 구조 타입 정의
 * 키-값 쌍으로 구성된 객체 타입
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * JSON 배열 구조 타입 정의
 * JsonValue 요소들의 배열
 */
export type JsonArray = Array<JsonValue>;

// ============================================================================
// 2. 오디오 관련 타입 정의
// ============================================================================

/**
 * 오디오 설정 매개변수 정의
 * 브라우저 AudioContext 및 MediaRecorder 설정에 사용
 */
export interface AudioConfig {
  /** OpenAI 지원 샘플레이트: 8000, 16000, 24000, 48000 */
  sampleRate: 8000 | 16000 | 24000 | 48000;
  /** 채널 수: 1(모노) 또는 2(스테레오) */
  channels: 1 | 2;
  /** 비트 깊이: OpenAI는 16비트만 지원 */
  bitsPerSample: 16;
}

// ============================================================================
// 3. OpenAI 세션 및 대화 타입 정의
// ============================================================================

/**
 * OpenAI Realtime API 세션 설정 구조 정의
 * WebSocket 연결 시 세션 초기화에 사용
 */
export interface SessionConfig {
  /** 지원 모달리티 ['text', 'audio'] */
  modalities: ("text" | "audio")[];
  /** AI 어시스턴트 지시사항 */
  instructions: string;
  /** 음성 종류 (alloy, echo, fable, onyx, nova, shimmer) */
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  /** 입력 오디오 형식 (pcm16, g711_ulaw, g711_alaw) */
  input_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw";
  /** 출력 오디오 형식 (pcm16, g711_ulaw, g711_alaw) */
  output_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw";
  /** 입력 오디오 전사 설정 (선택사항) */
  input_audio_transcription?: {
    /** 전사 모델 (whisper-1) */
    model: "whisper-1";
  };
  /** 음성 활동 감지 설정 (선택사항) */
  turn_detection?: {
    /** 감지 타입 (server_vad) */
    type: "server_vad";
    /** 음성 감지 임계값 (0.0 ~ 1.0) */
    threshold: number;
    /** 음성 시작 전 패딩 (ms) */
    prefix_padding_ms: number;
    /** 침묵 지속 시간 (ms) */
    silence_duration_ms: number;
  };
  /** 응답 창의성 조절 (0.0 ~ 1.0) */
  temperature: number;
  /** 최대 응답 토큰 수 */
  max_response_output_tokens: number;
}

/**
 * 대화 아이템 구조 정의
 * 사용자와 AI 간의 개별 메시지 단위
 */
// 현재 코드의 content 부분을 더 구체화
export interface ConversationItem {
  id: string;
  type: "message" | "function_call" | "function_call_output";
  role: MessageRole;
  content: MessageContent[];
}

// 새로운 타입 추가
export type MessageContent = TextContent | AudioContent;

export interface TextContent {
  type: "text";
  text: string;
}

export interface AudioContent {
  type: "audio";
  audio: string; // Base64 encoded
  transcript?: string; // 선택적 전사 텍스트
}

// ============================================================================
// 4. WebSocket 이벤트 타입 정의
// ============================================================================

/**
 * OpenAI WebSocket 이벤트 핸들러 인터페이스
 * 각 이벤트별로 콜백 함수를 정의할 수 있음
 */
export interface OpenAIEventHandlers {
  // === 세션 관련 이벤트 ===
  /** 세션 생성 완료 */
  sessionCreated?: (data: JsonObject) => void;
  /** 세션 설정 업데이트 완료 */
  sessionUpdated?: (data: JsonObject) => void;

  // === 음성 입력 관련 이벤트 ===
  /** 음성 감지 시작 */
  speechStarted?: (data: JsonObject) => void;
  /** 음성 감지 중지 */
  speechStopped?: (data: JsonObject) => void;
  /** 오디오 버퍼 커밋 완료 */
  committed?: (data: JsonObject) => void;

  // === 대화 아이템 관련 이벤트 ===
  /** 대화 아이템 생성 */
  itemCreated?: (data: JsonObject) => void;
  /** 실시간 음성 인식 텍스트 */
  inputAudioTranscriptionDelta?: (data: JsonObject) => void;
  /** 음성 인식 완료 */
  inputAudioTranscriptionCompleted?: (data: JsonObject) => void;

  // === AI 응답 관련 이벤트 ===
  /** 응답 생성 시작 */
  responseCreated?: (data: JsonObject) => void;
  /** 응답 생성 완료 */
  responseDone?: (data: JsonObject) => void;
  /** 실시간 오디오 스트림 */
  responseAudioDelta?: (data: JsonObject) => void;
  /** 오디오 응답 완료 */
  responseAudioDone?: (data: JsonObject) => void;
  /** 실시간 응답 텍스트 */
  responseAudioTranscriptDelta?: (data: JsonObject) => void;
  /** 응답 텍스트 완료 */
  responseAudioTranscriptDone?: (data: JsonObject) => void;

  // === 콘텐츠 관련 이벤트 ===
  /** 응답 콘텐츠 부분 추가 */
  responseContentPartAdded?: (data: JsonObject) => void;
  /** 응답 콘텐츠 부분 완료 */
  responseContentPartDone?: (data: JsonObject) => void;
  /** 출력 아이템 추가 */
  responseOutputItemAdded?: (data: JsonObject) => void;
  /** 출력 아이템 완료 */
  responseOutputItemDone?: (data: JsonObject) => void;

  // === 함수 호출 관련 이벤트 ===
  /** 함수 인자 실시간 업데이트 */
  responseFunctionCallArgumentsDelta?: (data: JsonObject) => void;
  /** 함수 인자 완료 */
  responseFunctionCallArgumentsDone?: (data: JsonObject) => void;

  // === 시스템 이벤트 ===
  /** 요청 제한 업데이트 */
  rateLimitsUpdated?: (data: JsonObject) => void;

  // === 연결 관련 이벤트 ===
  /** 오류 발생 */
  onError?: (error: Event) => void;
  /** 연결 종료 */
  onClose?: (event: CloseEvent) => void;
  /** 연결 성공 */
  onOpen?: (event: Event) => void;
}

// ============================================================================
// 5. WebSocket 설정 타입 정의
// ============================================================================

/**
 * OpenAI WebSocket 연결 설정 인터페이스
 */
export interface OpenAIWebSocketConfig {
  /** OpenAI API 키 (필수) */
  apiKey: string;
  /** 사용할 모델 (기본값: gpt-4o-realtime-preview-2024-12-17) */
  model?: string;
  /** 음성 종류 (alloy, echo, fable, onyx, nova, shimmer) */
  voice?: string;
  /** 입력 오디오 형식 (pcm16, g711_ulaw, g711_alaw) */
  inputAudioFormat?: string;
  /** 출력 오디오 형식 (pcm16, g711_ulaw, g711_alaw) */
  outputAudioFormat?: string;
  /** 응답 창의성 조절 (0.0 ~ 1.0) */
  temperature?: number;
  /** 최대 응답 토큰 수 */
  maxResponseTokens?: number;
}

// ============================================================================
// 6. 유틸리티 타입 정의
// ============================================================================

/**
 * 연결 상태 타입
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * 메시지 역할 타입
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * 오디오 형식 타입
 */
export type AudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";

/**
 * 음성 타입
 */
export type VoiceType =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";
