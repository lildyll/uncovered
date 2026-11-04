
"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

export default function AvatarPicker({
  file,
  onChange,
  disabled = false,
}: Props) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selected = event.target.files?.[0] || null;

    if (!selected) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(selected.type) ||
      selected.size > 10 * 1024 * 1024
    ) {
      alert("Choose a JPG, PNG, or WebP image under 10 MB.");
      event.target.value = "";
      return;
    }

    onChange(selected);

    // Allow selecting the same photo again.
    event.target.value = "";
  }

  function removePhoto() {
    onChange(null);

    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
    }

    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  }

  return (
    <div className="mb-5 flex items-center gap-4 rounded-3xl bg-white p-4 shadow-md dark:bg-slate-800">
      {/* Photo preview */}
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sky-600 dark:bg-slate-700 dark:text-sky-300">
        {preview ? (
          <img
            src={preview}
            alt="Selected profile preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <Camera className="h-7 w-7" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-800 dark:text-slate-100">
          Profile photo (optional)
        </p>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Take a selfie or choose a photo
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Take Photo */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl bg-violet-100 px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-200 disabled:opacity-50 dark:bg-violet-900/50 dark:text-violet-200"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>

          {/* Choose Photo */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl bg-sky-100 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-sky-200 disabled:opacity-50 dark:bg-slate-700 dark:text-sky-300"
          >
            <ImagePlus className="h-4 w-4" />
            Choose Photo
          </button>

          {/* Remove Photo */}
          {file && (
            <button
              type="button"
              disabled={disabled}
              onClick={removePhoto}
              aria-label="Remove selected photo"
              className="rounded-xl bg-red-100 p-2 text-red-600 dark:bg-red-950 dark:text-red-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Camera input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        disabled={disabled}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Gallery input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
