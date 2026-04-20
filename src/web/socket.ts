import { io } from 'socket.io-client';

// 단일 socket 채널. 서버(Task A9)가 session:create / session:join 핸들러를 등록하기 전까지는
// emit 후 ack 가 오지 않는다 — 정상. A9 머지 후 자동 동작.
export const socket = io({ autoConnect: false });
