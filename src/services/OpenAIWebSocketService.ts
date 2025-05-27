import type {
  JsonObject,
  OpenAIEventHandlers,
  OpenAIWebSocketConfig,
} from "../types/openai-types";

// ============================================================================
// 2. 메인 OpenAI WebSocket 서비스 클래스
// ============================================================================

export class OpenAIWebSocketService {
  // === 프라이빗 속성들 ===
  private ws: WebSocket | null = null; // WebSocket 연결 객체
  private config: OpenAIWebSocketConfig; // 설정 정보
  private handlers: OpenAIEventHandlers; // 이벤트 핸들러들
  private isConnected = false; // 연결 상태
  private reconnectAttempts = 0; // 재연결 시도 횟수
  private maxReconnectAttempts = 3; // 최대 재연결 시도 횟수
  private reconnectTimeout: number | null = null; // 재연결 타이머
  private connectionPromise: Promise<void> | null = null; // 연결 Promise (중복 연결 방지)

  // === 지원되는 설정 상수들 ===
  private readonly SUPPORTED_MODELS = [
    "gpt-4o-realtime-preview-2024-12-17",
    "gpt-4o-realtime-preview",
  ];

  private readonly SUPPORTED_VOICES = [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
  ];

  private readonly SUPPORTED_AUDIO_FORMATS = [
    "pcm16",
    "g711_ulaw",
    "g711_alaw",
  ];

  // ============================================================================
  // 3. 생성자 및 초기화
  // ============================================================================

  /**
   * OpenAI WebSocket 서비스 생성자
   * @param config - WebSocket 연결 설정
   * @param handlers - 이벤트 핸들러들
   */
  constructor(
    config: OpenAIWebSocketConfig,
    handlers: OpenAIEventHandlers = {}
  ) {
    this.config = this.validateAndNormalizeConfig(config);
    this.handlers = handlers;

    console.log("OpenAI WebSocket 서비스 초기화 완료:", {
      model: this.config.model,
      voice: this.config.voice,
      inputFormat: this.config.inputAudioFormat,
      outputFormat: this.config.outputAudioFormat,
    });
  }

  /**
   * 설정 검증 및 정규화
   * @param config - 원본 설정
   * @returns 검증된 설정
   */
  private validateAndNormalizeConfig(
    config: OpenAIWebSocketConfig
  ): OpenAIWebSocketConfig {
    if (!config.apiKey || config.apiKey.trim() === "") {
      throw new Error("OpenAI API 키가 필요합니다.");
    }

    const normalizedConfig: OpenAIWebSocketConfig = {
      apiKey: config.apiKey.trim(),
      model: config.model || "gpt-4o-realtime-preview-2024-12-17",
      voice: config.voice || "alloy",
      inputAudioFormat: config.inputAudioFormat || "pcm16",
      outputAudioFormat: config.outputAudioFormat || "pcm16",
      temperature: config.temperature ?? 0.8,
      maxResponseTokens: config.maxResponseTokens || 4096,
    };

    // 모델 검증
    if (!this.SUPPORTED_MODELS.includes(normalizedConfig.model!)) {
      console.warn(
        `지원되지 않는 모델: ${normalizedConfig.model}, 기본 모델로 변경`
      );
      normalizedConfig.model = this.SUPPORTED_MODELS[0];
    }

    // 음성 검증
    if (!this.SUPPORTED_VOICES.includes(normalizedConfig.voice!)) {
      console.warn(
        `지원되지 않는 음성: ${normalizedConfig.voice}, alloy로 변경`
      );
      normalizedConfig.voice = "alloy";
    }

    // 오디오 형식 검증
    if (
      !this.SUPPORTED_AUDIO_FORMATS.includes(normalizedConfig.inputAudioFormat!)
    ) {
      console.warn(
        `지원되지 않는 입력 오디오 형식: ${normalizedConfig.inputAudioFormat}, pcm16으로 변경`
      );
      normalizedConfig.inputAudioFormat = "pcm16";
    }

    if (
      !this.SUPPORTED_AUDIO_FORMATS.includes(
        normalizedConfig.outputAudioFormat!
      )
    ) {
      console.warn(
        `지원되지 않는 출력 오디오 형식: ${normalizedConfig.outputAudioFormat}, pcm16으로 변경`
      );
      normalizedConfig.outputAudioFormat = "pcm16";
    }

    return normalizedConfig;
  }

  // ============================================================================
  // 4. WebSocket 연결 관리
  // ============================================================================

  /**
   * OpenAI Realtime API에 WebSocket 연결 시작
   * @returns Promise<void> - 연결 완료 시 resolve
   */
  async connect(): Promise<void> {
    // 이미 연결 중이거나 연결된 경우 기존 Promise 반환
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.isConnected) {
      return Promise.resolve();
    }

    // 실제 연결 performConnection 메서드 호출
    this.connectionPromise = this.performConnection();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * 실제 WebSocket 연결 수행
   * @returns Promise<void>
   */
  private async performConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // OpenAI Realtime API WebSocket URL 구성
        const model = this.config.model!;
        const baseUrl = "wss://api.openai.com/v1/realtime";
        const url = `${baseUrl}?model=${encodeURIComponent(model)}`;

        console.log("OpenAI WebSocket 연결 시도:", url);

        // WebSocket 연결 생성
        // 브라우저 환경에서는 헤더를 직접 설정할 수 없으므로 프로토콜로 인증 정보 전달
        this.ws = new WebSocket(url, [
          "realtime",
          `openai-insecure-api-key.${this.config.apiKey}`,
          "openai-beta.realtime-v1",
        ]);

        // WebSocket 이벤트 핸들러 설정
        this.setupWebSocketEvents(resolve, reject);
      } catch (error) {
        console.error("WebSocket 연결 생성 실패:", error);
        reject(new Error(`WebSocket 연결 실패: ${error}`));
      }
    });
  }

  /**
   * WebSocket 이벤트 핸들러들 설정
   * @param resolve - 연결 성공 콜백
   * @param reject - 연결 실패 콜백
   */
  private setupWebSocketEvents(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.ws) return;

    // === 연결 성공 이벤트 ===
    this.ws.onopen = (event) => {
      console.log("✅ OpenAI WebSocket 연결 성공");
      this.isConnected = true;
      this.reconnectAttempts = 0; // 성공 시 재연결 카운터 리셋

      // 사용자 핸들러 호출
      this.handlers.onOpen?.(event);

      // 세션 설정 전송
      this.updateSession();

      // 연결 성공 시 Promise resolve
      resolve();
    };

    // === 메시지 수신 이벤트 ===
    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // === 연결 종료 이벤트 ===
    this.ws.onclose = (event) => {
      console.log("🔴 OpenAI WebSocket 연결 종료:", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });

      this.isConnected = false;

      // 사용자 핸들러 호출
      this.handlers.onClose?.(event);

      // 정상 종료가 아닌 경우 재연결 시도
      if (event.code !== 1000 && event.code !== 1001 && !event.wasClean) {
        console.log("비정상 종료 감지, 재연결 시도...");
        this.attemptReconnect();
      }
    };

    // === 오류 이벤트 ===
    this.ws.onerror = (event) => {
      console.error("❌ OpenAI WebSocket 오류:", event);
      this.isConnected = false;

      // 사용자 핸들러 호출
      this.handlers.onError?.(event);

      // 연결 중 오류 발생 시 reject
      reject(new Error("WebSocket 연결 오류"));
    };
  }

  /**
   * 재연결 시도 로직
   */
  private attemptReconnect(): void {
    // 최대 재연결 시도 횟수 확인
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ 최대 재연결 시도 횟수 초과, 재연결 포기");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      10000
    ); // 지수 백오프, 최대 10초

    console.log(
      `🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}, ${delay}ms 후 시도`
    );

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect().catch((error) => {
        console.error("재연결 실패:", error);
        // 재귀적으로 다시 시도
        this.attemptReconnect();
      });
    }, delay);
  }

  // ============================================================================
  // 5. 메시지 처리
  // ============================================================================

  /**
   * 수신된 메시지 처리
   * @param data - 수신된 JSON 문자열
   */
  private handleMessage(data: string): void {
    try {
      const responseJson: JsonObject = JSON.parse(data);
      const eventType = responseJson.type as string;

      console.log("📨 수신된 이벤트:", eventType, responseJson);

      // 오류 이벤트 우선 처리
      if (eventType === "error") {
        console.error("❌ OpenAI API 오류:", responseJson);
        this.handlers.onError?.(new Event("api-error"));
        return;
      }

      // 이벤트 타입별 핸들러 호출
      this.routeEventToHandler(eventType, responseJson);
    } catch (error) {
      console.error("❌ 메시지 파싱 오류:", error, "원본 데이터:", data);
    }
  }

  /**
   * 이벤트 타입에 따라 적절한 핸들러로 라우팅
   * @param eventType - 이벤트 타입
   * @param data - 이벤트 데이터
   */
  // 20개의 개별 이벤트를 분기 !! 중요
  private routeEventToHandler(eventType: string, data: JsonObject): void {
    switch (eventType) {
      // === 세션 관련 이벤트 ===
      case "session.created":
        this.handlers.sessionCreated?.(data);
        break;
      case "session.updated":
        this.handlers.sessionUpdated?.(data);
        break;

      // === 음성 입력 관련 이벤트 ===
      case "input_audio_buffer.speech_started":
        this.handlers.speechStarted?.(data);
        break;
      case "input_audio_buffer.speech_stopped":
        this.handlers.speechStopped?.(data);
        break;
      case "input_audio_buffer.committed":
        this.handlers.committed?.(data);
        break;

      // === 시스템 이벤트 ===
      case "rate_limits.updated":
        this.handlers.rateLimitsUpdated?.(data);
        break;

      // === 응답 관련 이벤트 ===
      case "response.created":
        this.handlers.responseCreated?.(data);
        break;
      case "response.done":
        this.handlers.responseDone?.(data);
        break;
      case "response.audio_transcript.delta":
        this.handlers.responseAudioTranscriptDelta?.(data);
        break;
      case "response.audio_transcript.done":
        this.handlers.responseAudioTranscriptDone?.(data);
        break;
      case "response.audio.delta":
        this.handlers.responseAudioDelta?.(data);
        break;
      case "response.audio.done":
        this.handlers.responseAudioDone?.(data);
        break;

      // === 콘텐츠 관련 이벤트 ===
      case "response.content_part.added":
        this.handlers.responseContentPartAdded?.(data);
        break;
      case "response.content_part.done":
        this.handlers.responseContentPartDone?.(data);
        break;
      case "response.output_item.added":
        this.handlers.responseOutputItemAdded?.(data);
        break;
      case "response.output_item.done":
        this.handlers.responseOutputItemDone?.(data);
        break;

      // === 대화 아이템 관련 이벤트 ===
      case "conversation.item.created":
        this.handlers.itemCreated?.(data);
        break;
      case "conversation.item.input_audio_transcription.delta":
        this.handlers.inputAudioTranscriptionDelta?.(data);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.handlers.inputAudioTranscriptionCompleted?.(data);
        break;

      // === 함수 호출 관련 이벤트 ===
      case "response.function_call_arguments.delta":
        this.handlers.responseFunctionCallArgumentsDelta?.(data);
        break;
      case "response.function_call_arguments.done":
        this.handlers.responseFunctionCallArgumentsDone?.(data);
        break;

      // === 처리되지 않은 이벤트 ===
      default:
        console.log("⚠️ 처리되지 않은 이벤트 타입:", eventType, data);
    }
  }

  // ============================================================================
  // 6. 세션 관리
  // ============================================================================

  /**
   * OpenAI 세션 설정 업데이트
   */
  private updateSession(): void {
    const sessionUpdate: JsonObject = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions:
          "당신은 친근하고 도움이 되는 한국어 음성 카페 직원입니다. 간결하고 자연스럽게 대답해주세요" +
          "만약 카페 주문외의 다른 질문이 들어오면 간단하게 처리 후, 다시 카페 주문으로 돌아가세요.",
        voice: this.config.voice || "alloy",
        input_audio_format: this.config.inputAudioFormat || "pcm16",
        output_audio_format: this.config.outputAudioFormat || "pcm16",

        input_audio_transcription: {
          model: "whisper-1",
        },

        turn_detection: {
          type: "server_vad", // 서버 기반 음성 활동 감지
          threshold: 0.5, // 음성 감지 임계값 (0.0-1.0)
          prefix_padding_ms: 300, // 음성 시작 전 패딩 (300ms)
          silence_duration_ms: 500, // 침묵 지속 시간 (500ms 후 자동 중지)
        },
        temperature: this.config.temperature || 0.8,
        max_response_output_tokens: this.config.maxResponseTokens || 4096,
      },
    };

    console.log("⚙️ 세션 설정 업데이트:", sessionUpdate.session);
    this.sendEvent(sessionUpdate);
  }

  // ============================================================================
  // 7. 이벤트 전송 메서드들
  // ============================================================================

  /**
   * OpenAI API로 이벤트 전송
   * @param event - 전송할 이벤트 객체
   */
  sendEvent(event: JsonObject): void {
    if (!this.isConnected || !this.ws) {
      console.error(
        "❌ WebSocket이 연결되지 않았습니다. 이벤트 전송 실패:",
        event.type
      );
      return;
    }

    try {
      const message = JSON.stringify(event);
      this.ws.send(message);
      console.log("📤 이벤트 전송:", event.type, event);
    } catch (error) {
      console.error("❌ 이벤트 전송 오류:", error, event);
    }
  }

  /**
   * 오디오 데이터를 OpenAI로 전송
   * @param audioData - Base64 인코딩된 오디오 데이터
   */
  sendAudio(audioData: string): void {
    if (!audioData || audioData.trim() === "") {
      console.warn("⚠️ 빈 오디오 데이터, 전송 건너뜀");
      return;
    }

    const audioEvent = {
      type: "input_audio_buffer.append",
      audio: audioData,
    };

    this.sendEvent(audioEvent);
  }

  /**
   * AI 응답 생성 요청
   * @param instructions - 추가 지시사항 (선택사항)
   */
  createResponse(instructions?: string): void {
    // response 객체를 먼저 생성
    const response: JsonObject = {
      modalities: ["text", "audio"],
    };

    // 추가 지시사항이 있는 경우 포함
    if (instructions) {
      response.instructions = instructions;
    }

    const responseEvent: JsonObject = {
      type: "response.create",
      response: response,
    };

    console.log("🎯 응답 생성 요청:", responseEvent);
    this.sendEvent(responseEvent);
  }

  /**
   * 입력 오디오 버퍼 커밋 (음성 입력 완료 신호)
   */
  commitAudioBuffer(): void {
    console.log("✅ 오디오 버퍼 커밋");
    this.sendEvent({ type: "input_audio_buffer.commit" });
  }

  /**
   * 입력 오디오 버퍼 클리어 (음성 입력 취소)
   */
  clearAudioBuffer(): void {
    console.log("🗑️ 오디오 버퍼 클리어");
    this.sendEvent({ type: "input_audio_buffer.clear" });
  }

  /**
   * 현재 응답 취소
   */
  cancelResponse(): void {
    console.log("❌ 응답 취소");
    this.sendEvent({ type: "response.cancel" });
  }

  // ============================================================================
  // 8. 상태 관리 및 유틸리티
  // ============================================================================

  /**
   * 현재 연결 상태 확인
   * @returns boolean - 연결 상태
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * WebSocket 준비 상태 확인
   * @returns string - 연결 상태 문자열
   */
  getReadyState(): string {
    if (!this.ws) return "DISCONNECTED";

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "CONNECTING";
      case WebSocket.OPEN:
        return "OPEN";
      case WebSocket.CLOSING:
        return "CLOSING";
      case WebSocket.CLOSED:
        return "CLOSED";
      default:
        return "UNKNOWN";
    }
  }

  /**
   * 현재 설정 정보 반환
   * @returns OpenAIWebSocketConfig - 현재 설정
   */
  getConfig(): Readonly<OpenAIWebSocketConfig> {
    return { ...this.config };
  }

  /**
   * 재연결 시도 횟수 반환
   * @returns number - 현재 재연결 시도 횟수
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  // ============================================================================
  // 9. 리소스 정리
  // ============================================================================

  /**
   * WebSocket 연결 종료 및 리소스 정리
   * @param code - 종료 코드 (기본값: 1000 - 정상 종료)
   * @param reason - 종료 이유
   */
  disconnect(code: number = 1000, reason: string = "Client disconnect"): void {
    console.log("🔌 WebSocket 연결 종료 시작:", { code, reason });

    // 재연결 타이머 정리
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
      console.log("⏰ 재연결 타이머 정리 완료");
    }

    // WebSocket 연결 종료
    if (this.ws) {
      try {
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(code, reason);
        }
      } catch (error) {
        console.error("❌ WebSocket 종료 중 오류:", error);
      }

      this.ws = null;
    }

    // 상태 초기화
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.connectionPromise = null;

    console.log("✅ WebSocket 연결 종료 및 리소스 정리 완료");
  }

  /**
   * 강제 재연결 (연결 상태와 관계없이 새로 연결)
   * @returns Promise<void>
   */
  async forceReconnect(): Promise<void> {
    console.log("🔄 강제 재연결 시작");

    // 기존 연결 종료
    this.disconnect(1000, "Force reconnect");

    // 잠시 대기 후 재연결
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 새로운 연결 시도
    return this.connect();
  }
}

// ============================================================================
// 10. 기본 내보내기
// ============================================================================

export default OpenAIWebSocketService;
