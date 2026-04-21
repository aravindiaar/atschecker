import { useState, useEffect } from "react";

const KEY_TEXT = "ats_resume_text";
const KEY_NAME = "ats_resume_filename";

export function useResumeStore() {
  const [resumeText, setResumeTextState] = useState<string | null>(null);
  const [filename, setFilenameState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY_TEXT);
    const savedName = localStorage.getItem(KEY_NAME);
    if (saved) setResumeTextState(saved);
    if (savedName) setFilenameState(savedName);
    setHydrated(true);
  }, []);

  const saveResume = (text: string, name: string) => {
    localStorage.setItem(KEY_TEXT, text);
    localStorage.setItem(KEY_NAME, name);
    setResumeTextState(text);
    setFilenameState(name);
  };

  const clearResume = () => {
    localStorage.removeItem(KEY_TEXT);
    localStorage.removeItem(KEY_NAME);
    setResumeTextState(null);
    setFilenameState(null);
  };

  return { resumeText, filename, hydrated, saveResume, clearResume };
}
