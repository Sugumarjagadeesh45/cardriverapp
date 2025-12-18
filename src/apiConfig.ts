const NGROK_URL = "https://5207a262405d.ngrok-free.app";

const useLocalhost = true;

export const API_BASE = useLocalhost
  ? `${NGROK_URL}/api`
  : "https://ba-lhhs.onrender.com/api";

export const SOCKET_URL = useLocalhost
  ? NGROK_URL
  : "https://ba-lhhs.onrender.com";
