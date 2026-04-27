import React from "react";
import { QRCodeSVG } from "qrcode.react";

interface QrCodePrinterProps {
  employeeName: string;
  employeeCode: string;
  qrToken: string;
  onClose: () => void;
}

const QrCodePrinter: React.FC<QrCodePrinterProps> = ({
  employeeName,
  employeeCode,
  qrToken,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="qr-modal-overlay">
      <div className="qr-modal-content">
        <div className="print-area">
          <div className="qr-card">
            <h2 className="qr-emp-name">{employeeName}</h2>
            <p className="qr-emp-code">社員番号: {employeeCode}</p>
            <div className="qr-code-wrapper">
              <QRCodeSVG value={qrToken} size={200} level="H" includeMargin={true} />
            </div>
            <p className="qr-token-text">{qrToken}</p>
          </div>
        </div>
        
        <div className="modal-actions no-print">
          <button onClick={handlePrint} className="print-button">印刷する</button>
          <button onClick={onClose} className="close-button">閉じる</button>
        </div>
      </div>

      <style>{`
        .qr-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .qr-modal-content {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          color: black;
          max-width: 400px;
          width: 100%;
          text-align: center;
        }
        .qr-card {
          border: 1px solid #ccc;
          padding: 2rem;
          margin-bottom: 1rem;
        }
        .qr-emp-name {
          margin: 0;
          font-size: 1.8rem;
        }
        .qr-emp-code {
          margin: 0.5rem 0;
          color: #666;
        }
        .qr-code-wrapper {
          margin: 1.5rem 0;
        }
        .qr-token-text {
          font-size: 0.8rem;
          color: #999;
          word-break: break-all;
        }
        .modal-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .print-button {
          background: #2e7d32;
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .close-button {
          background: #666;
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .qr-modal-overlay {
            background: none;
          }
          .qr-modal-content {
            box-shadow: none;
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default QrCodePrinter;
