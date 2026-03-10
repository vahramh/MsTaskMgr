import { useCallback, useMemo, useRef, useState } from "react";

type SpeechState = "idle" | "listening" | "error" | "unsupported";

type UseSpeechToTextOptions = {
  lang?: string;
  onResult?: (text: string) => void;
};

type SpeechErrorCode =
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "no-speech"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported"
  | string;

type SpeechResult = {
  supported: boolean;
  state: SpeechState;
  error: string | null;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

type RecognitionEventLike = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type RecognitionErrorEventLike = {
  error?: SpeechErrorCode;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: null | (() => void);
  onresult: null | ((event: RecognitionEventLike) => void);
  onerror: null | ((event: RecognitionErrorEventLike) => void);
  onend: null | (() => void);
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useSpeechToText(options?: UseSpeechToTextOptions): SpeechResult {
  const RecognitionCtor = useMemo<SpeechRecognitionConstructor | null>(() => {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }, []);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [state, setState] = useState<SpeechState>(RecognitionCtor ? "idle" : "unsupported");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!RecognitionCtor) {
      setState("unsupported");
      return;
    }

    if (state === "listening") return;
    if (recognitionRef.current) return;

    setError(null);

    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;

    recognition.lang = options?.lang ?? "en-AU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
    };

    recognition.onresult = (event) => {
      const text = event?.results?.[0]?.[0]?.transcript?.trim() ?? "";
      setTranscript(text);

      if (text) {
        options?.onResult?.(text);
      }

      recognition.stop();
    };

    recognition.onerror = (event) => {
      setError(event?.error ?? "speech-recognition-failed");
      setState("error");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setState("idle");
    };

    try {
      recognition.start();
    } catch (e) {
      recognitionRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [RecognitionCtor, options, state]);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
    setState(RecognitionCtor ? "idle" : "unsupported");
  }, [RecognitionCtor]);

  return {
    supported: !!RecognitionCtor,
    state,
    error,
    transcript,
    start,
    stop,
    reset,
  };
}