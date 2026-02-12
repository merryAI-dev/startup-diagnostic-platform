import { useState } from "react";
import { Upload, X, File } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { cn } from "@/redesign/app/components/ui/utils";

interface FileItem {
  id: string;
  name: string;
  size: number;
}

interface FileUploadProps {
  files: FileItem[];
  onFilesChange: (files: FileItem[]) => void;
  maxFiles?: number;
  className?: string;
}

export function FileUpload({
  files,
  onFilesChange,
  maxFiles = 5,
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const remainingSlots = maxFiles - files.length;
    const filesToAdd = newFiles.slice(0, remainingSlots);

    const fileItems: FileItem[] = filesToAdd.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
    }));

    onFilesChange([...files, ...fileItems]);
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((file) => file.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-gray-300 hover:border-gray-400"
        )}
      >
        <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm mb-2">
          파일을 드래그하거나 클릭하여 업로드
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          최대 {maxFiles}개 파일 (각 10MB 이하)
        </p>
        <label>
          <input
            type="file"
            multiple
            onChange={handleFileInput}
            className="hidden"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png"
          />
          <Button type="button" variant="outline" size="sm" asChild>
            <span>파일 선택</span>
          </Button>
        </label>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(file.id)}
                className="flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
