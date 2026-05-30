export default function RedesWinTracker() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', background: '#f4f5f7' }}>
      <iframe
        src="https://reportingvidika.online/login?embed=1"
        title="WinTracker by Vidika"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-write"
      />
    </div>
  );
}
