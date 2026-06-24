export default function PhoneMockup({ message, mediaPreview }) {
  return (
    <div className="w-full max-w-[280px] mx-auto bg-[#0b141a] rounded-[2rem] p-3 shadow-xl">
      <div className="bg-[#e5ddd5] rounded-2xl h-[480px] overflow-y-auto p-3 flex flex-col">
        <div className="bg-[#075e54] text-white text-xs rounded-t-lg px-3 py-2 -m-3 mb-3">
          Customer
        </div>
        <div className="bg-white rounded-lg p-2 max-w-[90%] self-start shadow text-sm whitespace-pre-wrap break-words">
          {mediaPreview && (
            <img src={mediaPreview} alt="media" className="rounded mb-2 max-h-40 object-cover" />
          )}
          {message || <span className="text-gray-400">Type a message to preview…</span>}
          <div className="text-[10px] text-gray-400 text-right mt-1">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
}
