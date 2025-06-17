import CryptoJS from 'crypto-js';
import JSEncrypt from 'jsencrypt';

class HostAuth {
    constructor() {
        // Storage keys
        this.PRIVATE_KEY_STORAGE = 'host_private_key';
        this.PUBLIC_KEY_STORAGE = 'host_public_key';

        // DOM elements
        this.setupPinInput = document.getElementById('setup-pin');
        this.setupConfirmPinInput = document.getElementById('setup-confirm-pin');
        this.generateKeysBtn = document.getElementById('generate-keys-btn');
        this.setupStatusDiv = document.getElementById('setup-status');

        this.loginPinInput = document.getElementById('login-pin');
        this.loginHostBtn = document.getElementById('login-host-btn');
        this.loginStatusDiv = document.getElementById('login-status');

        this.authPanel = document.getElementById('auth-panel');
        this.gameControls = document.getElementById('game-controls');
        this.hostPanel = document.getElementById('host-panel');
        this.playerPanel = document.getElementById('player-panel');

        // State
        this.isHost = false;
        this.privateKey = null;
        this.publicKey = null;

        // Initialize
        this.init();
    }

    init() {
        // Add event listeners
        this.generateKeysBtn.addEventListener('click', () => this.generateHostKeys());
        this.loginHostBtn.addEventListener('click', () => this.loginAsHost());

        // Check if keys already exist
        this.checkExistingKeys();
    }

    checkExistingKeys() {
        const publicKey = localStorage.getItem(this.PUBLIC_KEY_STORAGE);
        const privateKey = localStorage.getItem(this.PRIVATE_KEY_STORAGE);

        if (publicKey && privateKey) {
            this.showStatus(this.setupStatusDiv, 'Host keys are already set up. You can login as host.', 'info');
        }
    }

    generateHostKeys() {
        const pin = this.setupPinInput.value;
        const confirmPin = this.setupConfirmPinInput.value;

        // Validate PIN
        if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
            this.showStatus(this.setupStatusDiv, 'PIN must be at least 4 digits', 'error');
            return;
        }

        if (pin !== confirmPin) {
            this.showStatus(this.setupStatusDiv, 'PINs do not match', 'error');
            return;
        }

        try {
            // Generate RSA key pair
            const crypt = new JSEncrypt({default_key_size: 2048});
            const privateKey = crypt.getPrivateKey();
            const publicKey = crypt.getPublicKey();

            // Encrypt private key with PIN
            const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, pin).toString();

            // Store keys in localStorage
            localStorage.setItem(this.PRIVATE_KEY_STORAGE, encryptedPrivateKey);
            localStorage.setItem(this.PUBLIC_KEY_STORAGE, publicKey);

            this.showStatus(this.setupStatusDiv, 'Host keys generated successfully!', 'success');

            // Clear inputs
            this.setupPinInput.value = '';
            this.setupConfirmPinInput.value = '';
        } catch (error) {
            console.error('Error generating keys:', error);
            this.showStatus(this.setupStatusDiv, 'Error generating keys. Please try again.', 'error');
        }
    }

    loginAsHost() {
        const pin = this.loginPinInput.value;

        if (!pin) {
            this.showStatus(this.loginStatusDiv, 'Please enter your PIN', 'error');
            return;
        }

        try {
            // Get encrypted private key from storage
            const encryptedPrivateKey = localStorage.getItem(this.PRIVATE_KEY_STORAGE);
            const publicKey = localStorage.getItem(this.PUBLIC_KEY_STORAGE);

            if (!encryptedPrivateKey || !publicKey) {
                this.showStatus(this.loginStatusDiv, 'No host keys found. Please generate keys first.', 'error');
                return;
            }

            // Decrypt private key with PIN
            const decryptedPrivateKey = CryptoJS.AES.decrypt(encryptedPrivateKey, pin).toString(CryptoJS.enc.Utf8);

            if (!decryptedPrivateKey) {
                this.showStatus(this.loginStatusDiv, 'Incorrect PIN', 'error');
                return;
            }

            // Store keys in memory
            this.privateKey = decryptedPrivateKey;
            this.publicKey = publicKey;
            this.isHost = true;

            this.showStatus(this.loginStatusDiv, 'Successfully logged in as host!', 'success');

            // Switch to game view
            setTimeout(() => {
                this.authPanel.style.display = 'none';
                this.gameControls.style.display = 'block';
                this.hostPanel.style.display = 'block';
            }, 1000);

            // Notify game module that we're the host
            window.dispatchEvent(new CustomEvent('hostAuthenticated', {
                detail: { isHost: true }
            }));

            // Clear input
            this.loginPinInput.value = '';
        } catch (error) {
            console.error('Error logging in as host:', error);
            this.showStatus(this.loginStatusDiv, 'Error logging in. Please try again.', 'error');
        }
    }

    // Sign data with the host's private key
    signData(data) {
        if (!this.isHost || !this.privateKey) {
            console.error('Cannot sign data: Not authenticated as host');
            return null;
        }

        try {
            const crypt = new JSEncrypt();
            crypt.setPrivateKey(this.privateKey);
            return crypt.sign(JSON.stringify(data), CryptoJS.SHA256, 'sha256');
        } catch (error) {
            console.error('Error signing data:', error);
            return null;
        }
    }

    // Verify a signature with the host's public key
    verifySignature(data, signature, publicKey = null) {
        try {
            const keyToUse = publicKey || this.publicKey || localStorage.getItem(this.PUBLIC_KEY_STORAGE);

            if (!keyToUse) {
                console.error('No public key available for verification');
                return false;
            }

            const crypt = new JSEncrypt();
            crypt.setPublicKey(keyToUse);
            return crypt.verify(JSON.stringify(data), signature, CryptoJS.SHA256);
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    // Helper to show status messages
    showStatus(element, message, type) {
        element.textContent = message;
        element.className = 'status ' + type;
        element.style.display = 'block';
    }

    // Get the host status
    isHostAuthenticated() {
        return this.isHost;
    }

    // Get the public key
    getPublicKey() {
        return this.publicKey || localStorage.getItem(this.PUBLIC_KEY_STORAGE);
    }
}

// Create and export a singleton instance
const hostAuth = new HostAuth();
export default hostAuth;