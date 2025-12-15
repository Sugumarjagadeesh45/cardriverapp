const NGROK_URL = "https://eb4a6949d46b.ngrok-free.app";

const useLocalhost = true;

export const API_BASE = useLocalhost
  ? `${NGROK_URL}/api`
  : "https://ba-lhhs.onrender.com/api";

export const SOCKET_URL = useLocalhost
  ? NGROK_URL
  : "https://ba-lhhs.onrender.com";
