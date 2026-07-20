"use client";

type Question = {
  content: string;
  type: "single" | "multi";
  options: string[];
};

/** Mô phỏng đúng layout mobile mà thí sinh sẽ thấy (khung điện thoại thu nhỏ). */
export function QuestionPreview({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[380px] overflow-hidden">
        <div className="bg-slate-900 text-white text-xs px-4 py-2 flex justify-between">
          <span>08:45 còn lại</span>
          <span>Câu 3/40</span>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-base text-slate-900 font-medium">{question.content}</p>
          {question.type === "multi" && (
            <p className="text-xs text-slate-500">Chọn nhiều đáp án đúng</p>
          )}
          <div className="space-y-2">
            {question.options.map((opt, idx) => (
              <div
                key={idx}
                className="border border-slate-300 rounded-lg px-3 py-3 text-sm text-slate-800"
              >
                {String.fromCharCode(65 + idx)}. {opt || `(lựa chọn ${idx + 1})`}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 flex justify-between">
          <button className="text-sm text-slate-500">← Câu trước</button>
          <button className="text-sm text-slate-500">Câu sau →</button>
        </div>
        <div className="p-3 bg-slate-50 text-center">
          <button
            onClick={onClose}
            className="text-sm text-slate-600 hover:underline"
          >
            Đóng preview
          </button>
        </div>
      </div>
    </div>
  );
}
