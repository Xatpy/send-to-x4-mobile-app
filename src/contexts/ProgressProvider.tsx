import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ProgressContextValue {
    isUploading: boolean;
    progress?: number;
    uploadText: string;
    errorText: string | null;
    startUpload: (text?: string) => void;
    setProgress: (percent: number) => void;
    finishUpload: () => void;
    failUpload: (errorMsg: string) => void;
    clearProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress() {
    const ctx = useContext(ProgressContext);
    if (!ctx) throw new Error('useProgress must be used within a ProgressProvider');
    return ctx;
}

export function ProgressProvider({ children }: { children: ReactNode }) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgressState] = useState<number | undefined>(undefined);
    const [uploadText, setUploadText] = useState('Uploading...');
    const [errorText, setErrorText] = useState<string | null>(null);

    const startUpload = useCallback((text = 'Uploading...') => {
        setIsUploading(true);
        setProgressState(undefined);
        setUploadText(text);
        setErrorText(null);
    }, []);

    const setProgress = useCallback((percent: number) => {
        setProgressState(Math.max(0, Math.min(100, percent)));
    }, []);

    const finishUpload = useCallback(() => {
        setIsUploading(false);
        setProgressState(100);
        setErrorText(null);
    }, []);

    const failUpload = useCallback((errorMsg: string) => {
        setIsUploading(false);
        setErrorText(errorMsg);
    }, []);

    const clearProgress = useCallback(() => {
        setIsUploading(false);
        setProgressState(undefined);
        setErrorText(null);
    }, []);

    return (
        <ProgressContext.Provider
            value={{
                isUploading,
                progress,
                uploadText,
                errorText,
                startUpload,
                setProgress,
                finishUpload,
                failUpload,
                clearProgress,
            }}
        >
            {children}
        </ProgressContext.Provider>
    );
}
