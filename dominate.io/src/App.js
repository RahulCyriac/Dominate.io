// === App.js ===
import './App.css';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://dominate-io.onrender.com');

function App() {
  // Persisted identity
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [roomId, setRoomId]         = useState(localStorage.getItem('roomId')   || '');

  // Game state
  const [board, setBoard]           = useState([]);
  const [players, setPlayers]       = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [joined, setJoined]         = useState(false);
  const [isHost, setIsHost]         = useState(false);

  // Chat
  const [chatInput, setChatInput]   = useState('');
  const [messages, setMessages]     = useState([]);

  // Auction
  const [auction, setAuction]       = useState(null);
  const [bidAmount, setBidAmount]   = useState(0);

  // Trade
  const [tradeOpen, setTradeOpen]     = useState(false);
  const [tradeWith, setTradeWith]     = useState('');
  const [offerAmount, setOfferAmount] = useState(0);
  const [requestAmount, setRequestAmount] = useState(0);
  const [offerProps, setOfferProps]       = useState([]);
  const [requestProps, setRequestProps]   = useState([]);
  const [incomingTrade, setIncomingTrade] = useState(null);

  // Identify self
  const thisIdx = players.findIndex(p => p.id === socket.id);
  const thisPlayer = players[thisIdx] || {};
  const isMyTurn = thisIdx === currentPlayerIndex;
  const inDebt   = thisPlayer.money < 0;
  const isBankrupt = thisPlayer.isBankrupt;
  const isJailed = thisPlayer.isJailed;

  // Reconnect on load
  useEffect(() => {
    if (roomId && playerName) {
      socket.emit('reconnectRoom', { roomId, playerName });
    }

    socket.on('roomJoined', ({ players, roomId, isHost }) => {
      setPlayers(players);
      setRoomId(roomId);
      setJoined(true);
      setIsHost(isHost);
    });

    socket.on('playerJoined', ({ players }) => setPlayers(players));

    socket.on('gameState', ({ board, players, currentPlayerIndex, log }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
      setTradeOpen(false);
      setIncomingTrade(null);
      setOfferProps([]);
      setRequestProps([]);
    });

    socket.on('startAuction', ({ property }) => setAuction({ property, highestBid: 0 }));
    socket.on('updateAuction', data => setAuction(data));
    socket.on('endAuction', () => setAuction(null));

    socket.on('incomingTrade', data => setIncomingTrade(data));

    socket.on('chatMessage', ({ message, sender }) =>
      setMessages(ms => [...ms, { message, sender }])
    );

    socket.on('errorMessage', ({ message }) => alert(message));
    socket.on('gameOver', ({ winner }) => alert(`🏆 Winner: ${winner}`));

    return () => socket.disconnect();
  }, []);

  // Room actions
  const createRoom = () => {
    if (!playerName) return;
    localStorage.setItem('playerName', playerName);
    socket.emit('createRoom', { playerName });
  };
  const joinRoom = () => {
    if (!playerName || !roomId) return;
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('roomId', roomId);
    socket.emit('joinRoom', { playerName, roomId });
  };

  // Gameplay actions
  const startGame  = () => socket.emit('startGame', { roomId });
  const rollDice   = () => socket.emit('rollDice', { roomId });
  const sendChat   = () => {
    if (!chatInput.trim()) return;
    socket.emit('chatMessage', { roomId, message: chatInput, sender: playerName });
    setChatInput('');
  };
  const placeBid   = () => { if (bidAmount>0) { socket.emit('placeBid',{roomId,bid:bidAmount}); setBidAmount(0); }};
  const endAuction = () => socket.emit('endAuction', { roomId });
  const build      = pid => socket.emit('build', { roomId, propertyId: pid });
  const payJail    = () => socket.emit('payToLeaveJail', { roomId });
  const bankrupt   = () => socket.emit('declareBankruptcy', { roomId });

  // Trade actions
  const sendTradeOffer = () => {
    if (!tradeWith) return;
    socket.emit('tradeOffer', {
      roomId,
      from: socket.id,
      to: tradeWith,
      offerAmount,
      requestAmount,
      offerProps,
      requestProps
    });
    setTradeOpen(false);
  };
  const respondToTrade = accepted => {
    socket.emit('respondToTrade', {
      roomId,
      accepted,
      from: incomingTrade.from,
      offerAmount: incomingTrade.offerAmount,
      requestAmount: incomingTrade.requestAmount,
      offerProps: incomingTrade.offerProps,
      requestProps: incomingTrade.requestProps
    });
    setIncomingTrade(null);
  };

  return (
    <div className="App">
      <h1>🎲 Monopoly Multiplayer</h1>

      {!joined ? (
        <div>
          <input
            placeholder="Name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
          <input
            placeholder="Room ID"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
          />
          <button onClick={createRoom}>Create Room</button>
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <>
          <p>
            <strong>Room ID:</strong> {roomId}{' '}
            {isHost && <button onClick={startGame}>Start Game</button>}
          </p>

          <h2>Players</h2>
          {players.map((p, i) => (
            <div
              key={p.id}
              style={{
                border: i === currentPlayerIndex ? '2px solid gold' : '1px solid gray',
                padding: '5px',
                marginBottom: '5px'
              }}
            >
              {p.name} — ₹{p.money} {p.isJailed && '🚔'} {p.isBankrupt && '(Bankrupt)'}
            </div>
          ))}

          {isMyTurn && !isBankrupt && (
            <div className="actions">
              {!isJailed && (
                <button onClick={rollDice} disabled={inDebt}>
                  Roll Dice
                </button>
              )}
              {isJailed && <button onClick={payJail}>Pay ₹50 to Leave Jail</button>}
              {inDebt && <button onClick={bankrupt}>Declare Bankruptcy</button>}
              <button onClick={() => setTradeOpen(true)}>Propose Trade</button>
            </div>
          )}

          {/* Trade Dialog */}
          {tradeOpen && (
            <div className="trade-box">
              <h3>Propose Trade</h3>
              <select value={tradeWith} onChange={e => setTradeWith(e.target.value)}>
                <option value="">Select Player</option>
                {players
                  .filter(p => p.id !== socket.id && !p.isBankrupt)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <label>
                Offer ₹
                <input
                  type="number"
                  value={offerAmount}
                  onChange={e => setOfferAmount(Number(e.target.value))}
                />
              </label>
              <label>
                Request ₹
                <input
                  type="number"
                  value={requestAmount}
                  onChange={e => setRequestAmount(Number(e.target.value))}
                />
              </label>
              <label>Your Properties:</label>
              <select
                multiple
                value={offerProps}
                onChange={e =>
                  setOfferProps(Array.from(e.target.selectedOptions, o => Number(o.value)))
                }
              >
                {thisPlayer.properties?.map(pid => (
                  <option key={pid} value={pid}>
                    {board[pid]?.name} ({board[pid]?.houses}🏠 {board[pid]?.hotel && '🏨'})
                  </option>
                ))}
              </select>
              <label>Their Properties:</label>
              <select
                multiple
                value={requestProps}
                onChange={e =>
                  setRequestProps(Array.from(e.target.selectedOptions, o => Number(o.value)))
                }
              >
                {players
                  .find(p => p.id === tradeWith)
                  ?.properties.map(pid => (
                    <option key={pid} value={pid}>
                      {board[pid]?.name} ({board[pid]?.houses}🏠 {board[pid]?.hotel && '🏨'})
                    </option>
                  ))}
              </select>
              <button onClick={sendTradeOffer}>Send Offer</button>
              <button onClick={() => setTradeOpen(false)}>Cancel</button>
            </div>
          )}

          {/* Incoming Trade */}
          {incomingTrade && (
            <div className="trade-box">
              <h3>Incoming Trade</h3>
              <p>
                {players.find(p => p.id === incomingTrade.from)?.name} offers ₹
                {incomingTrade.offerAmount}{' '}
                {incomingTrade.offerProps.map(pid => board[pid]?.name).join(', ')} for ₹
                {incomingTrade.requestAmount}{' '}
                {incomingTrade.requestProps.map(pid => board[pid]?.name).join(', ')}
              </p>
              <button onClick={() => respondToTrade(true)}>Accept</button>
              <button onClick={() => respondToTrade(false)}>Reject</button>
            </div>
          )}

          {/* Auction and rest of UI follow... */}
        </>
      )}
    </div>
  );
}

export default App;
