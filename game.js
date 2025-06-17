import hostAuth from './auth.js';

class Game {
    constructor() {
        // DOM elements
        this.startGameBtn = document.getElementById('start-game-btn');
        this.resetGameBtn = document.getElementById('reset-game-btn');
        this.hostStatus = document.getElementById('host-status');
        this.playerStatus = document.getElementById('player-status');
        this.gameControls = document.getElementById('game-controls');

        // Host verification elements for players
        this.hostVerifyPanel = document.getElementById('host-verify-panel');
        this.hostFingerprintDisplay = document.getElementById('host-fingerprint');

        // Game state
        this.isHost = false;
        this.room = null;
        this.gameStarted = false;

        // Initialize
        this.init();
    }

    async init() {
        // Listen for host authentication
        window.addEventListener('hostAuthenticated', (e) => {
            this.isHost = e.detail.isHost;
            this.setupHostControls();
        });

        // Add event listeners
        this.startGameBtn.addEventListener('click', () => this.startGame());
        this.resetGameBtn.addEventListener('click', () => this.resetGame());

        // Initialize multiplayer room
        await this.initializeMultiplayer();

        // Show game controls if not host (as a player)
        if (!this.isHost) {
            this.gameControls.style.display = 'block';
        }
    }

    async initializeMultiplayer() {
        try {
            // Initialize WebsimSocket (globally available)
            this.room = new WebsimSocket();
            await this.room.initialize();

            // Subscribe to room state
            this.room.subscribeRoomState((currentRoomState) => {
                this.handleRoomStateUpdate(currentRoomState);
            });

            // Subscribe to presence updates
            this.room.subscribePresence((currentPresence) => {
                this.handlePresenceUpdate(currentPresence);
            });

            // Handle messages
            this.room.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            // Subscribe to presence update requests
            this.room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
                this.handlePresenceUpdateRequest(updateRequest, fromClientId);
            });

            console.log('Multiplayer initialized');
            this.playerStatus.textContent = `Connected as player (${this.room.peers[this.room.clientId].username})`;
            this.playerStatus.className = 'status success';

        } catch (error) {
            console.error('Error initializing multiplayer:', error);
            this.playerStatus.textContent = 'Error connecting to game server';
            this.playerStatus.className = 'status error';
        }
    }

    setupHostControls() {
        if (this.isHost) {
            this.hostStatus.textContent = 'You are authenticated as the host';
            this.hostStatus.className = 'status success';

            // Broadcast host public key to all players
            this.broadcastHostPublicKey();
        }
    }

    broadcastHostPublicKey() {
        const publicKey = hostAuth.getPublicKey();
        const fingerprint = hostAuth.getKeyFingerprint();

        if (!publicKey) {
            console.error('No public key available to broadcast');
            return;
        }

        // Send the host's public key to all players
        this.room.send({
            type: 'host_public_key',
            publicKey: publicKey,
            fingerprint: fingerprint,
            clientId: this.room.clientId,
            timestamp: Date.now()
        });

        // Also update room state with host info
        this.room.updateRoomState({
            hostInfo: {
                clientId: this.room.clientId,
                publicKey: publicKey,
                fingerprint: fingerprint,
                timestamp: Date.now()
            }
        });

        console.log('Broadcast host public key with fingerprint:', fingerprint);
    }

    startGame() {
        if (!this.isHost) {
            console.error('Only the host can start the game');
            return;
        }

        // Create signed game start message
        const gameStartData = {
            action: 'game_start',
            timestamp: Date.now(),
            settings: {
                // Game settings here
                difficulty: 'normal',
                maxPlayers: 4
            }
        };

        // Sign the data with host's private key
        const signature = hostAuth.signData(gameStartData);

        if (!signature) {
            console.error('Failed to sign game start message');
            return;
        }

        // Send signed game start command
        this.room.send({
            type: 'game_command',
            command: 'start',
            data: gameStartData,
            signature: signature,
            clientId: this.room.clientId
        });

        // Update room state
        this.room.updateRoomState({
            gameState: {
                status: 'playing',
                startedAt: Date.now(),
                startedBy: this.room.clientId
            }
        });

        this.gameStarted = true;
        this.hostStatus.textContent = 'Game started!';
    }

    resetGame() {
        if (!this.isHost) {
            console.error('Only the host can reset the game');
            return;
        }

        // Create signed game reset message
        const gameResetData = {
            action: 'game_reset',
            timestamp: Date.now()
        };

        // Sign the data with host's private key
        const signature = hostAuth.signData(gameResetData);

        if (!signature) {
            console.error('Failed to sign game reset message');
            return;
        }

        // Send signed game reset command
        this.room.send({
            type: 'game_command',
            command: 'reset',
            data: gameResetData,
            signature: signature,
            clientId: this.room.clientId
        });

        // Update room state
        this.room.updateRoomState({
            gameState: {
                status: 'reset',
                resetAt: Date.now(),
                resetBy: this.room.clientId
            }
        });

        this.gameStarted = false;
        this.hostStatus.textContent = 'Game reset!';
    }

    handleMessage(data) {
        switch (data.type) {
            case 'connected':
                console.log(`Client connected: ${data.clientId}, ${data.username}`);
                // If we're the host, send our public key to the new player
                if (this.isHost) {
                    setTimeout(() => this.broadcastHostPublicKey(), 500);
                }
                break;

            case 'disconnected':
                console.log(`Client disconnected: ${data.clientId}, ${data.username}`);
                break;

            case 'host_public_key':
                console.log('Received host public key with fingerprint:', data.fingerprint);
                // Store the host's public key for future verification
                localStorage.setItem('host_public_key_remote', data.publicKey);
                localStorage.setItem('host_fingerprint_remote', data.fingerprint);

                // Update player status to show host information
                this.playerStatus.textContent = `Connected to host (${data.fingerprint})`;
                this.playerStatus.className = 'status success';

                // Show verification panel for players
                if (!this.isHost && this.hostVerifyPanel && this.hostFingerprintDisplay) {
                    this.hostVerifyPanel.style.display = 'block';
                    this.hostFingerprintDisplay.value = data.fingerprint;
                }
                break;

            case 'game_command':
                this.handleGameCommand(data);
                break;

            default:
                console.log('Received event:', data);
        }
    }

    handleGameCommand(data) {
        // Get the host's public key
        const hostPublicKey = this.room.roomState?.hostInfo?.publicKey || 
                              localStorage.getItem('host_public_key_remote');

        if (!hostPublicKey) {
            console.error('No host public key available for verification');
            return;
        }

        // Verify the command signature
        const isValid = hostAuth.verifySignature(data.data, data.signature, hostPublicKey);

        if (!isValid) {
            console.error('Invalid game command signature');
            this.playerStatus.textContent = 'Warning: Received invalid command from supposed host!';
            this.playerStatus.className = 'status error';
            return;
        }

        console.log('Verified host command:', data.command);

        // Process the command
        switch (data.command) {
            case 'start':
                this.playerStatus.textContent = 'Game started by host!';
                this.playerStatus.className = 'status success';
                this.gameStarted = true;
                break;

            case 'reset':
                this.playerStatus.textContent = 'Game reset by host!';
                this.playerStatus.className = 'status success';
                this.gameStarted = false;
                break;

            default:
                console.log('Unknown game command:', data.command);
        }
    }

    handleRoomStateUpdate(roomState) {
        console.log('Room state updated:', roomState);

        // Check for host information in room state
        if (roomState.hostInfo && !this.isHost) {
            const { publicKey, fingerprint, clientId } = roomState.hostInfo;

            // Store host info
            localStorage.setItem('host_public_key_remote', publicKey);
            localStorage.setItem('host_fingerprint_remote', fingerprint);

            // Display host fingerprint for verification
            if (this.hostVerifyPanel && this.hostFingerprintDisplay) {
                this.hostVerifyPanel.style.display = 'block';
                this.hostFingerprintDisplay.value = fingerprint;
            }

            // Update player status
            const hostUsername = this.room.peers[clientId]?.username || 'Unknown';
            this.playerStatus.textContent = `Connected to host: ${hostUsername} (${fingerprint})`;
            this.playerStatus.className = 'status success';
        }
    }

    handlePresenceUpdate(presence) {
        console.log('Presence updated:', presence);
        // Handle presence updates here
    }

    handlePresenceUpdateRequest(updateRequest, fromClientId) {
        console.log('Presence update request:', updateRequest, 'from:', fromClientId);
        // Handle presence update requests here
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
});