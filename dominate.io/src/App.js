import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('https://dominate-io.onrender.com');

export default function App() {
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [roomId, setRoomId] = useState(localStorage.getItem('roomId') || '');
  const [players, setPlayers] = useState([]);
  const [joined, setJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [board, setBoard] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [log, setLog] = useState('');
  const [logHistory, setLogHistory] = useState([]);

  useEffect(() => {
    if (playerName && roomId) {
      socket.emit('reconnectRoom', { playerName, roomId });
    }

    socket.on('roomJoined', ({ players, roomId, isHost }) => {
      setPlayers(players);
      setRoomId(roomId);
      setJoined(true);
      setIsHost(isHost);
      localStorage.setItem('roomId', roomId);
    });

    socket.on('playerJoined', ({ players }) => setPlayers(players));
    socket.on('gameStarted', () => setGameStarted(true));
    socket.on('gameState', ({ board, players, currentPlayerIndex, log, logHistory }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLog(log);
      setLogHistory(logHistory);
      setGameStarted(true);
    });

    return () => socket.disconnect();
  }, [playerName, roomId]);

  const createRoom = () => {
    if (!playerName.trim()) return;
    localStorage.setItem('playerName', playerName);
    socket.emit('createRoom', { playerName });
  };

  const joinRoom = () => {
    if (!playerName.trim() || !roomId.trim()) return;
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('roomId', roomId);
    socket.emit('joinRoom', { playerName, roomId });
  };

  const leaveRoom = () => {
    socket.emit('leaveRoom', { roomId });
    setJoined(false);
    setGameStarted(false);
    setRoomId('');
    setPlayers([]);
    localStorage.removeItem('roomId');
  };

  const startGame = () => socket.emit('startGame', { roomId });
  const rollDice = () => socket.emit('rollDice', { roomId });

  return (
    <div className="app dark">
      {!joined ? (
        <div className="modal">
          <h1 className="text-3xl font-bold text-center">🎲 Monopoly Multiplayer</h1>
          <input className="input" type="text" placeholder="Enter your name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          <input className="input" type="text" placeholder="Enter Room ID (or leave empty)" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <div className="button-group">
            <button onClick={createRoom} className="btn">Create Room</button>
            <button onClick={joinRoom} className="btn">Join Room</button>
          </div>
        </div>
      ) : !gameStarted ? (
        <div className="modal">
          <h2 className="text-xl font-semibold text-center">Room ID: {roomId}</h2>
          <ul className="player-list">
            {players.map((p) => <li key={p.id}>{p.name}</li>)}
          </ul>
          {isHost ? (
            <button onClick={startGame} className="btn mt-2">Start Game</button>
          ) : (
            <p className="text-center">Waiting for host to start...</p>
          )}
          <button onClick={leaveRoom} className="btn mt-2">Leave Room</button>
        </div>
      ) : (
        <div className="game-container">
          <div className="sidebar">
            <h2>Players</h2>
            <ul>
              {players.map((p, idx) => (
                <li key={p.id} className={idx === currentPlayerIndex ? 'current-player' : ''}>
                  {p.color} {p.name} - ₹{p.money}
                </li>
              ))}
            </ul>
            <button onClick={rollDice} className="btn mt-2">🎲 Roll Dice</button>
            <button onClick={leaveRoom} className="btn mt-2">Leave Game</button>
          </div>

          <div className="board">
            {board.map((tile) => (
              <div key={tile.id} className={`tile ${tile.type}`}>
                <span className="tile-name">{tile.name}</span>
              </div>
            ))}
          </div>

          <div className="log">
            <h2>Game Log</h2>
            <ul>
              {logHistory.slice().reverse().map((entry, index) => (
                <li key={index}><strong>{entry.timestamp}</strong>: {entry.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
