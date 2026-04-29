import React, { useEffect, useRef } from "react";
import jsQR from "jsqr";

interface CameraScannerProps {
  onScan: (code: string) => void;
  isActive: boolean;
}

const CameraScanner: React.FC<CameraScannerProps> = ({ onScan, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) return;

    let animationFrameId: number;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          onScan(code.data);
        }
      }
      animationFrameId = requestAnimationFrame(scan);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
        video.play();
        animationFrameId = requestAnimationFrame(scan);
      })
      .catch((err) => {
        console.error("カメラの起動に失敗しました:", err);
      });

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScan, isActive]);

  return (
    <div className="camera-scanner">
      <video
        ref={videoRef}
        style={{ width: "100%", maxWidth: "400px", borderRadius: "8px", transform: "scaleX(-1)" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default CameraScanner;
