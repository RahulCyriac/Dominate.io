import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://dominate-io.onrender.com');

function App() {
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [roomId, setRoomId] = useState(localStorage.getItem('roomId') || '');
  const [board, setBoard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [logHistory, setLogHistory] = useState([]);
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [auction, setAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState(0);

  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeWith, setTradeWith] = useState('');
  const [offerAmount, setOfferAmount] = useState(0);
  const [requestAmount, setRequestAmount] = useState(0);
  const [offerProps, setOfferProps] = useState([]);
  const [requestProps, setRequestProps] = useState([]);
  const [incomingTrade, setIncomingTrade] = useState(null);

  const [showBuildMenu, setShowBuildMenu] = useState(false);
  const [showPropertyMenu, setShowPropertyMenu] = useState(false);

  const thisIdx = players.findIndex(p => p.id === socket.id);
  const thisPlayer = players[thisIdx] || {};
  const isMyTurn = thisIdx === currentPlayerIndex;
  const inDebt = thisPlayer.money < 0;
  const isBankrupt = thisPlayer.isBankrupt;
  const isJailed = thisPlayer.isJailed;

  useEffect(() => {
    if (roomId && playerName) {
      socket.emit('reconnectRoom', { roomId, playerName });
    }

    socket.on('roomJoined', ({ players, roomId, isHost }) => {
      setPlayers(players);
      setRoomId(roomId);
      setJoined(true);
      setIsHost(isHost);
      localStorage.setItem('roomId', roomId);
    });

    socket.on('playerJoined', ({ players }) => setPlayers(players));

    socket.on('gameState', ({ board, players, currentPlayerIndex, log, logHistory }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
      setLogHistory(logHistory || []);
      setGameStarted(true);
      setTradeOpen(false);
      setIncomingTrade(null);
      setOfferProps([]);
      setRequestProps([]);
    });

    socket.on('startAuction', ({ property }) => {
      setAuction({ property, highestBid: 0, highestBidder: null });
    });

    socket.on('updateAuction', (data) => {
      setAuction(prev => ({ ...prev, ...data }));
    });

    socket.on('endAuction', () => setAuction(null));

    socket.on('incomingTrade', (data) => setIncomingTrade(data));

    socket.on('chatMessage', ({ message, sender }) => {
      setMessages(ms => [...ms, { message, sender, timestamp: new Date().toLocaleTimeString() }]);
    });

    socket.on('errorMessage', ({ message }) => alert(message));
    socket.on('gameOver', ({ winner }) => alert(`🏆 Game Over! Winner: ${winner}`));

    return () => socket.disconnect();
  }, [roomId, playerName]);

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

  const startGame = () => socket.emit('startGame', { roomId });
  const rollDice = () => socket.emit('rollDice', { roomId });

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('chatMessage', { roomId, message: chatInput, sender: playerName });
    setChatInput('');
  };

  const placeBid = () => {
    if (bidAmount > 0) {
      socket.emit('placeBid', { roomId, bid: bidAmount });
      setBidAmount(0);
    }
  };

  const endAuction = () => socket.emit('endAuction', { roomId });
  const build = (pid) => socket.emit('build', { roomId, propertyId: pid });
  const payJail = () => socket.emit('payToLeaveJail', { roomId });
  const bankrupt = () => {
    if (confirm('Are you sure you want to declare bankruptcy?')) {
      socket.emit('declareBankruptcy', { roomId });
    }
  };

  const mortgageProperty = (pid) => socket.emit('mortgageProperty', { roomId, propertyId: pid });
  const unmortgageProperty = (pid) => socket.emit('unmortgageProperty', { roomId, propertyId: pid });

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
    setOfferAmount(0);
    setRequestAmount(0);
    setOfferProps([]);
    setRequestProps([]);
  };

  const respondToTrade = (accepted) => {
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

  const getPropertyName = (pid) => board[pid]?.name || `Property ${pid}`;
  const getPlayerColor = (color) => {
    const colors = {
      red: '#e74c3c',
      blue: '#3498db',
      green: '#2ecc71',
      purple: '#9b59b6',
      orange: '#f39c12',
      teal: '#1abc9c',
      yellow: '#f1c40f',
      pink: '#e91e63'
    };
    return colors[color] || color;
  };

  const renderBoard = () => (
    <div className="board">
      {board.map((tile, i) => (
        <div 
          key={i} 
          className={`tile ${tile.isMortgaged ? 'mortgaged' : ''} ${tile.type === 'special' ? 'special' : ''}`}
          style={{
            backgroundColor: tile.owner !== null && tile.owner !== undefined 
              ? `${getPlayerColor(players[tile.owner]?.color)}20` 
              : '#fff'
          }}
        >
          <div className="tile-name">{tile.name}</div>
          {tile.price && (
            <div className="tile-price">₹{tile.price}</div>
          )}
          {tile.houses > 0 && (
            <div className="houses">
              {'🏠'.repeat(tile.houses)}
            </div>
          )}
          {tile.hotel && (
            <div className="hotel">🏨</div>
          )}
          {tile.isMortgaged && (
            <div className="mortgage-label">MORTGAGED</div>
          )}
          <div className="players">
            {players
              .filter(p => p.position === i)
              .map(p => (
                <div
                  key={p.id}
                  className="player-token"
                  style={{
                    backgroundColor: getPlayerColor(p.color),
                    border: `2px solid ${p.isBankrupt ? '#999' : '#000'}`
                  }}
                  title={p.name}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderPlayerList = () => (
    <div className="players-list">
      <h3>Players</h3>
      {players.map((p, i) => (
        <div
          key={p.id}
          className={`player-card ${i === currentPlayerIndex ? 'current-turn' : ''} ${p.isBankrupt ? 'bankrupt' : ''}`}
          style={{ borderLeft: `4px solid ${getPlayerColor(p.color)}` }}
        >
          <div className="player-info">
            <strong>{p.name}</strong>
            {i === currentPlayerIndex && <span className="turn-indicator">🎯</span>}
            {p.isJailed && <span className="jail-icon">🚔</span>}
            {p.isBankrupt && <span className="bankrupt-label">💀</span>}
          </div>
          <div className="player-money">₹{p.money}</div>
          <div className="player-properties">
            Properties: {p.properties?.length || 0}
          </div>
        </div>
      ))}
    </div>
  );

  if (!joined) {
    return (
      <div className="app">
        <div className="welcome-screen">
          <h1>🎲 Monopoly Multiplayer</h1>
          <div className="join-form">
            <h2>Join the Game</h2>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Room ID (optional for new room)"
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
              className="input-field"
            />
            <div className="button-group">
              <button onClick={createRoom} className="btn-primary">
                Create New Room
              </button>
              <button onClick={joinRoom} className="btn-secondary">
                Join Existing Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="app">
        <div className="lobby">
          <h1>🎲 Monopoly - Room {roomId}</h1>
          <div className="lobby-content">
            {renderPlayerList()}
            {isHost && (
              <div className="host-controls">
                <button onClick={startGame} className="btn-start">
                  Start Game
                </button>
              </div>
            )}
            {!isHost && (
              <div className="waiting-message">
                Waiting for host to start the game...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="game-header">
        <h1>🎲 Monopoly - Room {roomId}</h1>
        <div className="game-info">
          <span>Current Turn: <strong>{players[currentPlayerIndex]?.name}</strong></span>
          {isHost && (
            <button onClick={startGame} className="btn-restart">
              Restart Game
            </button>
          )}
        </div>
      </header>

      <div className="game-layout">
        <div className="main-game">
          {renderBoard()}
          
          {/* Game Controls */}
          {isMyTurn && !isBankrupt && (
            <div className="game-controls">
              <h3>Your Turn</h3>
              <div className="control-buttons">
                {!isJailed && (
                  <button 
                    onClick={rollDice} 
                    disabled={inDebt}
                    className="btn-roll"
                  >
                    🎲 Roll Dice
                  </button>
                )}
                {isJailed && (
                  <button onClick={payJail} className="btn-jail">
                    Pay ₹50 to Leave Jail
                  </button>
                )}
                {inDebt && (
                  <button onClick={bankrupt} className="btn-danger">
                    💀 Declare Bankruptcy
                  </button>
                )}
                <button 
                  onClick={() => setTradeOpen(true)} 
                  className="btn-trade"
                >
                  💼 Propose Trade
                </button>
                <button 
                  onClick={() => setShowBuildMenu(!showBuildMenu)} 
                  className="btn-build"
                >
                  🏠 Build/Manage
                </button>
                <button 
                  onClick={() => setShowPropertyMenu(!showPropertyMenu)} 
                  className="btn-properties"
                >
                  🏘️ My Properties
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar">
          {renderPlayerList()}
          
          {/* Log History */}
          <div className="log-section">
            <h3>Game Log</h3>
            <div className="log-history">
              {logHistory.slice(-10).map((entry, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{entry.timestamp}</span>
                  <span className="log-message">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="chat-section">
            <h3>Chat</h3>
            <div className="chat-messages">
              {messages.slice(-5).map((msg, i) => (
                <div key={i} className="chat-message">
                  <span className="chat-sender">{msg.sender}:</span>
                  <span className="chat-text">{msg.message}</span>
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
                className="input-field"
              />
              <button onClick={sendChat} className="btn-send">Send</button>
            </div>
          </div>
        </div>
      </div>

      {/* Property Management Modal */}
      {showPropertyMenu && (
        <div className="modal-overlay" onClick={() => setShowPropertyMenu(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>My Properties</h3>
            <div className="property-list">
              {thisPlayer.properties?.map(pid => {
                const property = board[pid];
                if (!property) return null;
                return (
                  <div key={pid} className="property-item">
                    <div className="property-info">
                      <strong>{property.name}</strong>
                      <span>₹{property.price}</span>
                    </div>
                    <div className="property-actions">
                      {property.isMortgaged ? (
                        <button 
                          onClick={() => unmortgageProperty(pid)}
                          className="btn-unmortgage"
                        >
                          Unmortgage (₹{Math.ceil((property.price / 2) * 1.1)})
                        </button>
                      ) : (
                        <button 
                          onClick={() => mortgageProperty(pid)}
                          className="btn-mortgage"
                        >
                          Mortgage (₹{Math.floor(property.price / 2)})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowPropertyMenu(false)} className="btn-close">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Build Menu Modal */}
      {showBuildMenu && (
        <div className="modal-overlay" onClick={() => setShowBuildMenu(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Build Houses & Hotels</h3>
            <div className="build-list">
              {thisPlayer.properties?.map(pid => {
                const property = board[pid];
                if (!property || property.type !== 'property') return null;
                return (
                  <div key={pid} className="build-item">
                    <div className="build-info">
                      <strong>{property.name}</strong>
                      <div className="build-status">
                        {property.houses > 0 && `Houses: ${property.houses}`}
                        {property.hotel && 'Hotel: 1'}
                        {property.houses === 0 && !property.hotel && 'No buildings'}
                      </div>
                    </div>
                    <button 
                      onClick={() => build(pid)}
                      className="btn-build-action"
                      disabled={property.isMortgaged}
                    >
                      Build (₹50)
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowBuildMenu(false)} className="btn-close">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Auction Modal */}
      {auction && (
        <div className="modal-overlay">
          <div className="modal auction-modal">
            <h3>🔨 Property Auction</h3>
            <div className="auction-info">
              <h4>{auction.property.name}</h4>
              <p>Price: ₹{auction.property.price}</p>
              <p>Current Highest Bid: ₹{auction.highestBid}</p>
            </div>
            <div className="auction-controls">
              <input
                type="number"
                value={bidAmount}
                onChange={e => setBidAmount(Number(e.target.value))}
                placeholder="Your bid"
                min={auction.highestBid + 1}
                className="input-field"
              />
              <button onClick={placeBid} className="btn-bid">
                Place Bid
              </button>
              {isHost && (
                <button onClick={endAuction} className="btn-end-auction">
                  End Auction
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trade Proposal Modal */}
      {tradeOpen && (
        <div className="modal-overlay" onClick={() => setTradeOpen(false)}>
          <div className="modal trade-modal" onClick={e => e.stopPropagation()}>
            <h3>💼 Propose Trade</h3>
            <div className="trade-form">
              <div className="trade-section">
                <label>Trade with:</label>
                <select 
                  value={tradeWith} 
                  onChange={e => setTradeWith(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select player...</option>
                  {players.filter(p => p.id !== socket.id && !p.isBankrupt).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="trade-amounts">
                <div>
                  <label>You offer (₹):</label>
                  <input
                    type="number"
                    value={offerAmount}
                    onChange={e => setOfferAmount(Number(e.target.value))}
                    min="0"
                    className="input-field"
                  />
                </div>
                <div>
                  <label>You request (₹):</label>
                  <input
                    type="number"
                    value={requestAmount}
                    onChange={e => setRequestAmount(Number(e.target.value))}
                    min="0"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="trade-properties">
                <div>
                  <label>Your properties to offer:</label>
                  <select
                    multiple
                    value={offerProps}
                    onChange={e => setOfferProps([...e.target.selectedOptions].map(o => Number(o.value)))}
                    className="property-select"
                  >
                    {thisPlayer.properties?.map(pid => (
                      <option key={pid} value={pid}>
                        {getPropertyName(pid)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Properties you want:</label>
                  <select
                    multiple
                    value={requestProps}
                    onChange={e => setRequestProps([...e.target.selectedOptions].map(o => Number(o.value)))}
                    className="property-select"
                  >
                    {tradeWith && players.find(p => p.id === tradeWith)?.properties?.map(pid => (
                      <option key={pid} value={pid}>
                        {getPropertyName(pid)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="trade-actions">
                <button onClick={sendTradeOffer} className="btn-send-trade">
                  Send Trade Offer
                </button>
                <button onClick={() => setTradeOpen(false)} className="btn-cancel">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Trade Modal */}
      {incomingTrade && (
        <div className="modal-overlay">
          <div className="modal trade-response-modal">
            <h3>📨 Incoming Trade Offer</h3>
            <div className="trade-details">
              <p><strong>From:</strong> {players.find(p => p.id === incomingTrade.from)?.name}</p>
              <div className="trade-summary">
                <div className="offer-section">
                  <h4>They offer:</h4>
                  <p>Money: ₹{incomingTrade.offerAmount}</p>
                  <div className="property-list">
                    {incomingTrade.offerProps.map(pid => (
                      <span key={pid} className="property-tag">
                        {getPropertyName(pid)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="request-section">
                  <h4>They want:</h4>
                  <p>Money: ₹{incomingTrade.requestAmount}</p>
                  <div className="property-list">
                    {incomingTrade.requestProps.map(pid => (
                      <span key={pid} className="property-tag">
                        {getPropertyName(pid)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="trade-response-actions">
              <button onClick={() => respondToTrade(true)} className="btn-accept">
                ✅ Accept Trade
              </button>
              <button onClick={() => respondToTrade(false)} className="btn-reject">
                ❌ Reject Trade
              </button>
            </div>
          </div>
        </div>
      )}
    </div> )}


export default App;