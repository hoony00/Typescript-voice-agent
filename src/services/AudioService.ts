// src/services/AudioService.ts

// ============================================================================
// 1. 타입 정의 및 인터페이스
// ============================================================================

/**
 * MediaRecorder 옵션 타입 정의
 */
interface MediaRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  bitsPerSecond?: number;
}

/**
 * MediaRecorder 에러 이벤트 타입 정의
 */
interface MediaRecorderErrorEvent extends Event {
  error: DOMException;
}

/**
 * 오디오 설정 인터페이스
 */
interface AudioConfig {
  sampleRate: number; // 샘플링 레이트 (Hz)
  channelCount: number; // 채널 수 (1: 모노, 2: 스테레오)
  echoCancellation: boolean; // 에코 제거
  noiseSuppression: boolean; // 노이즈 제거
  autoGainControl: boolean; // 자동 게인 조절
  latency: number; // 지연시간 (초)
}

/**
 * 브라우저 지원 기능 확인 인터페이스
 */
interface BrowserSupport {
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  audioContext: boolean;
}

// ============================================================================
// 2. 메인 AudioService 클래스
// ============================================================================

/**
 * 오디오 녹음, 스트리밍, 재생을 담당하는 서비스 클래스
 * OpenAI Realtime API와 호환되는 PCM16 형식을 지원
 */
export class AudioService {
  // === 프라이빗 속성들 ===
  private mediaRecorder: MediaRecorder | null = null; // 미디어 녹음기
  private audioContext: AudioContext | null = null; // 오디오 컨텍스트
  private stream: MediaStream | null = null; // 미디어 스트림
  private isRecording = false; // 녹음 상태
  private audioQueue: string[] = []; // 오디오 재생 큐
  private currentSource: AudioBufferSourceNode | null = null; // 현재 재생 중인 소스

  // === 오디오 설정 상수들 ===
  private readonly SAMPLE_RATE = 24000; // OpenAI 권장 샘플레이트
  private readonly CHANNEL_COUNT = 1; // 모노 채널
  private readonly CHUNK_DURATION = 400; // 데이터 수집 간격 (ms)
  private readonly AUDIO_BITS_PER_SECOND = 24000; // 비트레이트

  // 로그 출력 빈도 제어
  private logCounter = 0;

  // === 지원되는 MIME 타입들 (우선순위 순) ===
  private readonly SUPPORTED_MIME_TYPES = [
    "audio/webm;codecs=opus", // 최고 품질, Chrome/Firefox 지원
    "audio/webm", // 기본 WebM
    "audio/mp4", // Safari 지원
    "audio/wav", // 범용 지원
  ];

  // ============================================================================
  // 3. 초기화 및 설정
  // ============================================================================

  /**
   * 오디오 서비스 생성자
   */
  constructor() {
    console.log("🎵 AudioService 초기화 시작");

    // 브라우저 호환성 확인
    this.checkBrowserSupport();
  }

  /**
   * 브라우저 지원 기능 확인
   */
  private checkBrowserSupport(): void {
    const features: BrowserSupport = {
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      mediaRecorder: !!window.MediaRecorder,
      audioContext: !!(
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      ),
    };

    console.log("🔍 브라우저 지원 기능:", features);

    // 필수 기능 확인
    if (!features.mediaDevices || !features.getUserMedia) {
      throw new Error("이 브라우저는 미디어 장치 접근을 지원하지 않습니다.");
    }
    if (!features.mediaRecorder) {
      throw new Error("이 브라우저는 미디어 녹음을 지원하지 않습니다.");
    }
    if (!features.audioContext) {
      throw new Error("이 브라우저는 오디오 처리를 지원하지 않습니다.");
    }
  }

  /**
   * 마이크 권한 요청 및 오디오 스트림 초기화
   * @returns Promise<void> - 초기화 완료 시 resolve
   */
  async initializeAudio(): Promise<void> {
    try {
      console.log("🎤 마이크 권한 요청 중...");

      // 오디오 제약 조건 설정 (OpenAI Realtime API 최적화)
      const audioConfig: AudioConfig = {
        sampleRate: this.SAMPLE_RATE,
        channelCount: this.CHANNEL_COUNT,
        echoCancellation: true, // 에코 제거로 음성 품질 향상
        noiseSuppression: true, // 배경 노이즈 제거
        autoGainControl: true, // 자동 볼륨 조절
        latency: 0.01, // 10ms 낮은 지연시간
      };

      // 미디어 스트림 요청
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConfig,
      });

      console.log("✅ 마이크 권한 획득 성공");

      // AudioContext 초기화 (크로스 브라우저 호환성)
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("AudioContext를 지원하지 않는 브라우저입니다.");
      }

      this.audioContext = new AudioContextClass({
        sampleRate: this.SAMPLE_RATE,
        latencyHint: "interactive", // 실시간 상호작용에 최적화
      });

      // AudioContext 상태 확인 및 활성화
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      console.log("✅ 오디오 초기화 완료:", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        baseLatency: this.audioContext.baseLatency,
        outputLatency: this.audioContext.outputLatency,
      });
    } catch (error) {
      console.error("❌ 오디오 초기화 실패:", error);

      // 구체적인 오류 메시지 제공
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          throw new Error(
            "마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요."
          );
        } else if (error.name === "NotFoundError") {
          throw new Error(
            "마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요."
          );
        } else if (error.name === "NotReadableError") {
          throw new Error(
            "마이크에 접근할 수 없습니다. 다른 애플리케이션에서 사용 중일 수 있습니다."
          );
        }
      }

      throw new Error(
        "오디오 초기화에 실패했습니다. 마이크 권한을 확인해주세요."
      );
    }
  }

  // ============================================================================
  // 4. MIME 타입 및 호환성 관리
  // ============================================================================

  /**
   * 브라우저에서 지원하는 최적의 MIME 타입 찾기
   * @returns string - 지원되는 MIME 타입 또는 빈 문자열
   */
  private getSupportedMimeType(): string {
    console.log("🔍 지원되는 MIME 타입 검색 중...");

    for (const mimeType of this.SUPPORTED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log("✅ 지원되는 MIME 타입 발견:", mimeType);
        return mimeType;
      }
    }

    console.warn("⚠️ 지원되는 오디오 형식이 없습니다. 기본 설정을 사용합니다.");
    return "";
  }

  /**
   * MediaRecorder 옵션 생성
   * @returns MediaRecorderOptions - 최적화된 녹음 옵션
   */
  private createMediaRecorderOptions(): MediaRecorderOptions {
    const mimeType = this.getSupportedMimeType();

    const options: MediaRecorderOptions = {
      audioBitsPerSecond: this.AUDIO_BITS_PER_SECOND,
    };

    // 지원되는 MIME 타입이 있는 경우에만 설정
    if (mimeType) {
      options.mimeType = mimeType;
    }

    console.log("⚙️ MediaRecorder 옵션:", options);
    return options;
  }

  // ============================================================================
  // 5. 실시간 오디오 스트리밍
  // ============================================================================

  /**
   * 실시간 오디오 스트리밍 시작
   * @param onAudioData - 오디오 데이터 콜백 함수 (Base64 PCM16 형식)
   */
  startStreaming(onAudioData: (audioData: string) => void): void {
    // 초기화 상태 확인
    if (!this.stream || !this.audioContext) {
      throw new Error(
        "오디오가 초기화되지 않았습니다. initializeAudio()를 먼저 호출하세요."
      );
    }

    // 이미 녹음 중인 경우 중복 방지
    if (this.isRecording) {
      console.warn("⚠️ 이미 녹음이 진행 중입니다.");
      return;
    }

    try {
      console.log("🎙️ 실시간 오디오 스트리밍 시작...");

      // MediaRecorder 생성 및 설정
      const options = this.createMediaRecorderOptions();
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      // === 이벤트 핸들러 설정 ===

      // 오디오 데이터 수신 이벤트
      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data.size > 0) {
          try {
            // 로그 출력 빈도 제어 (5번에 1번만 출력)
            this.logCounter++;
            if (this.logCounter % 5 === 0) {
              console.log(
                `📦 오디오 청크 수신: ${event.data.size} bytes (${this.logCounter}번째)`
              );
            }

            // Blob을 ArrayBuffer로 변환
            const audioBuffer = await event.data.arrayBuffer();

            // PCM16 형식으로 변환 (OpenAI Realtime API 요구사항)
            const pcm16Data = await this.convertToPCM16(audioBuffer);

            // Base64로 인코딩
            const base64Audio = this.arrayBufferToBase64(pcm16Data);

            // 콜백 함수 호출
            onAudioData(base64Audio);
          } catch (error) {
            console.error("❌ 오디오 데이터 처리 오류:", error);
          }
        }
      };

      // 녹음 시작 이벤트
      this.mediaRecorder.onstart = () => {
        console.log("▶️ MediaRecorder 녹음 시작");
        this.isRecording = true;
      };

      // 녹음 중지 이벤트
      this.mediaRecorder.onstop = () => {
        console.log("⏹️ MediaRecorder 녹음 중지");
        this.isRecording = false;
      };

      // 오류 이벤트 (수정된 부분 - any 타입 제거)
      this.mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
        console.error("❌ MediaRecorder 오류:", event.error);
        this.isRecording = false;
      };

      // 녹음 시작 (지정된 간격으로 데이터 수집)
      this.mediaRecorder.start(this.CHUNK_DURATION);

      console.log(
        `✅ 오디오 스트리밍 시작 완료 (${this.CHUNK_DURATION}ms 간격)`
      );
    } catch (error) {
      console.error("❌ 오디오 스트리밍 시작 실패:", error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * 오디오 스트리밍 중지
   */
  stopStreaming(): void {
    if (this.mediaRecorder && this.isRecording) {
      try {
        console.log("⏹️ 오디오 스트리밍 중지 중...");

        this.mediaRecorder.stop();
        this.mediaRecorder = null;

        console.log("✅ 오디오 스트리밍 중지 완료");
      } catch (error) {
        console.error("❌ 오디오 스트리밍 중지 실패:", error);
      }
    } else {
      console.log("ℹ️ 녹음이 진행 중이지 않습니다.");
    }
  }

  // ============================================================================
  // 6. 오디오 형식 변환
  // ============================================================================

  /**
   * WebM/Opus 오디오를 PCM16 형식으로 변환
   * @param audioBuffer - 원본 오디오 데이터 (ArrayBuffer)
   * @returns Promise<ArrayBuffer> - PCM16 형식의 오디오 데이터
   */
  // WAV 헤더 생성 함수
  private createWavFile(audioBuffer: ArrayBuffer): ArrayBuffer {
    const wavHeader = this.createWavHeader(audioBuffer.byteLength);
    const wavFile = new ArrayBuffer(
      wavHeader.byteLength + audioBuffer.byteLength
    );

    // 헤더 복사
    new Uint8Array(wavFile).set(new Uint8Array(wavHeader), 0);
    // 오디오 데이터 복사
    new Uint8Array(wavFile).set(
      new Uint8Array(audioBuffer),
      wavHeader.byteLength
    );

    return wavFile;
  }

  private createWavHeader(dataLength: number): ArrayBuffer {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // WAV 파일 헤더 생성
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // 모노
    view.setUint32(24, this.SAMPLE_RATE, true); // 샘플레이트
    view.setUint32(28, this.SAMPLE_RATE * 2, true); // 바이트레이트
    view.setUint16(32, 2, true); // 블록 정렬
    view.setUint16(34, 16, true); // 비트 깊이
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    return header;
  }

  // PCM16 변환 메서드
  private async convertToPCM16(audioBuffer: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.audioContext) {
      throw new Error("AudioContext가 초기화되지 않았습니다.");
    }

    // 너무 작은 청크는 건너뛰기
    if (audioBuffer.byteLength < 100) {
      console.log(
        "⚠️ 청크가 너무 작음, 건너뜀:",
        audioBuffer.byteLength,
        "bytes"
      );
      return new ArrayBuffer(0);
    }

    try {
      const decodedAudio = await this.audioContext.decodeAudioData(
        audioBuffer.slice(0)
      );

      // 성공 시에만 간단한 로그
      if (this.logCounter % 10 === 0) {
        console.log("✅ PCM16 변환 성공:", {
          duration: decodedAudio.duration.toFixed(3),
          samples: decodedAudio.length,
        });
      }

      const channelData = decodedAudio.getChannelData(0);
      const pcm16Buffer = new ArrayBuffer(channelData.length * 2);
      const pcm16View = new Int16Array(pcm16Buffer);

      for (let i = 0; i < channelData.length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        pcm16View[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      return pcm16Buffer;
    } catch (error) {
      // 실패 시에만 로그 출력
      console.error("❌ PCM16 변환 실패:", error);
      return new ArrayBuffer(0); // 빈 버퍼 반환
    }
  }

  // ============================================================================
  // 7. 오디오 재생
  // ============================================================================

  /**
   * Base64 인코딩된 PCM16 오디오 재생
   * @param base64Audio - Base64로 인코딩된 PCM16 오디오 데이터
   * @returns Promise<void> - 재생 시작 시 resolve
   */
  async playAudio(base64Audio: string): Promise<void> {
    if (!this.audioContext) {
      console.error("❌ AudioContext가 초기화되지 않았습니다.");
      return;
    }

    // 빈 데이터 확인
    if (!base64Audio || base64Audio.trim() === "") {
      console.warn("⚠️ 빈 오디오 데이터, 재생 건너뜀");
      return;
    }

    // AudioContext 상태 확인 및 활성화
    if (this.audioContext.state === "suspended") {
      try {
        console.log("🔄 AudioContext 활성화 중...");
        await this.audioContext.resume();
      } catch (error) {
        console.error("❌ AudioContext 활성화 실패:", error);
        return;
      }
    }

    try {
      console.log("🔊 오디오 재생 시작...");

      // Base64 → ArrayBuffer 변환
      const audioBuffer = this.base64ToArrayBuffer(base64Audio);
      const pcm16Array = new Int16Array(audioBuffer);

      console.log(`📊 재생할 오디오 정보: ${pcm16Array.length} samples`);

      // AudioBuffer 생성 (PCM16 → Float32 변환)
      const audioBufferObj = this.audioContext.createBuffer(
        this.CHANNEL_COUNT, // 채널 수 (모노)
        pcm16Array.length, // 샘플 수
        this.SAMPLE_RATE // 샘플레이트
      );

      // PCM16을 Float32로 변환하여 AudioBuffer에 복사
      const channelData = audioBufferObj.getChannelData(0);
      for (let i = 0; i < pcm16Array.length; i++) {
        // Int16 (-32768 ~ 32767)을 Float32 (-1.0 ~ 1.0)로 변환
        channelData[i] = pcm16Array[i] / (pcm16Array[i] < 0 ? 0x8000 : 0x7fff);
      }

      // 이전 재생 중지
      if (this.currentSource) {
        try {
          this.currentSource.stop();
        } catch {
          // 이미 중지된 경우 무시
        }
      }

      // AudioBufferSourceNode 생성 및 재생
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBufferObj;
      this.currentSource.connect(this.audioContext.destination);

      // 재생 완료 이벤트
      this.currentSource.onended = () => {
        console.log("✅ 오디오 재생 완료");
        this.currentSource = null;
      };

      // 재생 시작
      this.currentSource.start();

      console.log("🎵 오디오 재생 시작됨");
    } catch (error) {
      console.error("❌ 오디오 재생 실패:", error);
    }
  }

  /**
   * 현재 재생 중인 오디오 중지
   */
  stopPlayback(): void {
    if (this.currentSource) {
      try {
        console.log("⏹️ 오디오 재생 중지");
        this.currentSource.stop();
        this.currentSource = null;
      } catch (error) {
        console.error("❌ 오디오 재생 중지 실패:", error);
      }
    }
  }

  // ============================================================================
  // 8. 데이터 변환 유틸리티
  // ============================================================================

  /**
   * ArrayBuffer를 Base64 문자열로 변환
   * @param buffer - 변환할 ArrayBuffer
   * @returns string - Base64 인코딩된 문자열
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    try {
      const bytes = new Uint8Array(buffer);
      let binary = "";

      // 성능 최적화: 청크 단위로 처리
      const chunkSize = 8192;
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        const chunk = bytes.subarray(
          i,
          Math.min(i + chunkSize, bytes.byteLength)
        );
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }

      return btoa(binary);
    } catch (error) {
      console.error("❌ Base64 인코딩 실패:", error);
      return "";
    }
  }

  /**
   * Base64 문자열을 ArrayBuffer로 변환
   * @param base64 - Base64 인코딩된 문자열
   * @returns ArrayBuffer - 디코딩된 이진 데이터
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
    } catch (error) {
      console.error("❌ Base64 디코딩 실패:", error);
      return new ArrayBuffer(0);
    }
  }

  // ============================================================================
  // 9. 상태 관리 및 정보 조회
  // ============================================================================

  /**
   * 현재 녹음 상태 확인
   * @returns boolean - 녹음 중이면 true, 아니면 false
   */
  getRecordingStatus(): boolean {
    return this.isRecording;
  }

  /**
   * AudioContext 상태 확인
   * @returns string - AudioContext의 현재 상태
   */
  getAudioContextState(): string {
    return this.audioContext?.state || "not-initialized";
  }

  /**
   * 미디어 스트림 상태 확인
   * @returns boolean - 스트림이 활성화되어 있으면 true
   */
  getStreamStatus(): boolean {
    return this.stream?.active || false;
  }

  /**
   * 오디오 설정 정보 반환
   * @returns object - 현재 오디오 설정 정보
   */
  getAudioInfo(): object {
    return {
      sampleRate: this.SAMPLE_RATE,
      channelCount: this.CHANNEL_COUNT,
      chunkDuration: this.CHUNK_DURATION,
      audioBitsPerSecond: this.AUDIO_BITS_PER_SECOND,
      isRecording: this.isRecording,
      audioContextState: this.getAudioContextState(),
      streamActive: this.getStreamStatus(),
    };
  }

  // ============================================================================
  // 10. 리소스 정리 및 해제
  // ============================================================================

  /**
   * 모든 오디오 리소스 정리 및 해제
   * 메모리 누수 방지를 위해 컴포넌트 언마운트 시 반드시 호출
   */
  cleanup(): void {
    console.log("🧹 오디오 리소스 정리 시작...");

    try {
      // 1. 녹음 중지
      this.stopStreaming();

      // 2. 재생 중지
      this.stopPlayback();

      // 3. 미디어 스트림 해제
      if (this.stream) {
        console.log("📡 미디어 스트림 해제 중...");
        this.stream.getTracks().forEach((track) => {
          track.stop();
          console.log(`🛑 트랙 중지: ${track.kind} - ${track.label}`);
        });
        this.stream = null;
      }

      // 4. AudioContext 해제
      if (this.audioContext) {
        console.log("🎵 AudioContext 해제 중...");
        this.audioContext
          .close()
          .then(() => {
            console.log("✅ AudioContext 해제 완료");
          })
          .catch((error) => {
            console.error("❌ AudioContext 해제 실패:", error);
          });
        this.audioContext = null;
      }

      // 5. 상태 초기화
      this.isRecording = false;
      this.mediaRecorder = null;
      this.currentSource = null;
      this.audioQueue = [];

      console.log("✅ 오디오 리소스 정리 완료");
    } catch (error) {
      console.error("❌ 리소스 정리 중 오류 발생:", error);
    }
  }

  /**
   * 오디오 서비스 재초기화
   * 오류 복구 또는 설정 변경 시 사용
   * @returns Promise<void>
   */
  async reinitialize(): Promise<void> {
    console.log("🔄 오디오 서비스 재초기화 시작...");

    // 기존 리소스 정리
    this.cleanup();

    // 잠시 대기 (리소스 해제 완료 대기)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 재초기화
    await this.initializeAudio();

    console.log("✅ 오디오 서비스 재초기화 완료");
  }
}

// ============================================================================
// 11. 기본 내보내기
// ============================================================================

export default AudioService;
