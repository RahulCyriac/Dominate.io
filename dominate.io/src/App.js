import './App.css';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://dominate-io.onrender.com');

function App() {
  const [board, setBoard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [offer, setOffer] = useState(null);
  const [cardAction, setCardAction] = useState(null);

  useEffect(() => {
    socket.on('playerJoined', ({ players }) => setPlayers(players));
    socket.on('gameState', ({ board, players, currentPlayerIndex, log }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
    });
    socket.on('tileAction', ({ type, tile, playerMoney, deck }) => {
      if (type === 'PURCHASE_OFFER') setOffer({ tile, canBuy: playerMoney >= tile.price });
      if (type === 'DRAW_CARD') setCardAction({ deck });
    });
    return () => socket.disconnect();
  }, []);

  const createRoom = () => {
    if (!playerName) return;
    const newRoomId = Math.random().toString(36).substring(2,8);
    setRoomId(newRoomId);
    socket.emit('createRoom', { roomId: newRoomId, playerName });
    setJoined(true);
  };
  const joinRoom = () => {
    if (!playerName || !roomId) return;
    socket.emit('joinRoom', { roomId, playerName });
    setJoined(true);
  };
  const startGame = () => socket.emit('startGame', { roomId });
  const rollDice = () => socket.emit('rollDice', { roomId });

  const respondToOffer = (buy) => {
    socket.emit(buy ? 'buyProperty' : 'declinePurchase', { roomId });
    setOffer(null);
  };
  const resolveCard = (log) => {
    socket.emit('cardResolved', { roomId, log });
    setCardAction(null);
  };

  return (
    <div className="App">
      <h1>🎲 Monopoly Multiplayer</h1>
      {!joined ? (
        <div>
          <input placeholder="Name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
          <input placeholder="Room ID (to join)" value={roomId} onChange={e => setRoomId(e.target.value)} />
          <button onClick={createRoom}>Create Room</button>
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <>
          <p><strong>Room ID:</strong> {roomId}</p>
          <button onClick={startGame}>Start Game</button>
          <h2>Players</h2>
          {players.map((p, idx) => (
            <div key={p.id} style={{ border: idx===currentPlayerIndex?'2px solid gold':'1px solid gray', padding:5, marginBottom:5 }}>
              {p.name} - ₹{p.money} {p.isJailed?'🚔':''}
            </div>
          ))}
          <button onClick={rollDice}>Roll Dice</button>
          <p>{logMessage}</p>
        </>
      )}

      {offer && (
        <div className="modal">
          <p>Buy {offer.tile.name} for ₹{offer.tile.price}?</p>
          <button disabled={!offer.canBuy} onClick={()=>respondToOffer(true)}>Buy</button>
          <button onClick={()=>respondToOffer(false)}>Skip</button>
        </div>
      )}

      {cardAction && (
        <div className="modal">
          <p>Drew a card from {cardAction.deck}. (Implement card UI)</p>
          <button onClick={()=>resolveCard(`${playerName} resolved a ${cardAction.deck} card`)}>Continue</button>
        </div>
      )}
    </div>
  );
}

export default App;