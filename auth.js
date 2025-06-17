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

        // Key display elements
        this.publicKeyDisplay = document.getElementById('public-key-display');
        this.fingerprintDisplay = document.getElementById('fingerprint-display');
        this.copyPublicKeyBtn = document.getElementById('copy-public-key-btn');
        this.copyFingerprintBtn = document.getElementById('copy-fingerprint-btn');

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

        // Add copy button event listeners
        if (this.copyPublicKeyBtn) {
            this.copyPublicKeyBtn.addEventListener('click', () => this.copyToClipboard(this.publicKeyDisplay.value, 'Public key copied!'));
        }

        if (this.copyFingerprintBtn) {
            this.copyFingerprintBtn.addEventListener('click', () => this.copyToClipboard(this.fingerprintDisplay.value, 'Fingerprint copied!'));
        }

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

        // Show a "generating" message as key creation can be slow
        this.showStatus(this.setupStatusDiv, 'Generating keys... this may take a moment.', 'info');

        // Use a short timeout to allow the UI to update with the "Generating" message
        setTimeout(() => {
            try {
                // Generate RSA key pair
                const crypt = new JSEncrypt({ default_key_size: 2048 });

                // getKey() is asynchronous and uses a callback.
                crypt.getKey(() => {
                    const privateKey = crypt.getPrivateKey();
                    const publicKey = crypt.getPublicKey();

                    if (!privateKey || !publicKey) {
                        this.showStatus(this.setupStatusDiv, 'Failed to generate keys. Please try again.', 'error');
                        console.error('JSEncrypt failed to generate keys.');
                        return;
                    }

                    // Generate a fingerprint for the public key
                    const fingerprint = this.generateKeyFingerprint(publicKey);

                    // Encrypt private key with PIN
                    const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, pin).toString();

                    // Store keys in localStorage
                    localStorage.setItem(this.PRIVATE_KEY_STORAGE, encryptedPrivateKey);
                    localStorage.setItem(this.PUBLIC_KEY_STORAGE, publicKey);
                    localStorage.setItem('host_key_fingerprint', fingerprint);

                    this.showStatus(this.setupStatusDiv, 'Host keys generated successfully!', 'success');

                    // Clear inputs
                    this.setupPinInput.value = '';
                    this.setupConfirmPinInput.value = '';
                });
            } catch (error) {
                console.error('Error generating keys:', error);
                this.showStatus(this.setupStatusDiv, 'Error generating keys. Please try again.', 'error');
            }
        }, 50); // 50ms timeout
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
            const fingerprint = localStorage.getItem('host_key_fingerprint') || 
                                this.generateKeyFingerprint(publicKey);

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

            // Display keys
            if (this.publicKeyDisplay && this.fingerprintDisplay) {
                this.publicKeyDisplay.value = publicKey;
                this.fingerprintDisplay.value = fingerprint;
            }

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

    // Generate a fingerprint for a public key (simplified SHA-256 hash)
    generateKeyFingerprint(publicKey) {
        if (!publicKey) return '';

        // Generate SHA-256 hash of the public key
        const hash = CryptoJS.SHA256(publicKey);
        const fullHash = hash.toString(CryptoJS.enc.Hex);

        // Format as XX:XX:XX:XX (taking first 8 bytes)
        const formattedFingerprint = fullHash.substring(0, 16).match(/.{1,2}/g).join(':').toUpperCase();

        return formattedFingerprint;
    }

    // Copy text to clipboard
    copyToClipboard(text, successMessage = 'Copied!') {
        if (!text) return;

        // Create temporary textarea element
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', ''); // Make it readonly to avoid focus
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px'; // Move outside the screen

        document.body.appendChild(textarea);
        textarea.select();

        try {
            const success = document.execCommand('copy');
            if (success) {
                this.showCopyNotification(successMessage);
            } else {
                console.error('Failed to copy text');
            }
        } catch (err) {
            console.error('Error copying text: ', err);
        }

        document.body.removeChild(textarea);
    }

    // Show a notification when text is copied
    showCopyNotification(message) {
        // Check if notification already exists
        let notification = document.querySelector('.copy-notification');

        // Create notification if it doesn't exist
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'copy-notification';
            document.body.appendChild(notification);
        }

        // Set notification message and display
        notification.textContent = message;
        notification.style.display = 'block';

        // Hide notification after 2 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 2000);
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

    // Get the key fingerprint
    getKeyFingerprint() {
        return localStorage.getItem('host_key_fingerprint') || 
               this.generateKeyFingerprint(this.getPublicKey());
    }
}

// Create and export a singleton instance
const hostAuth = new HostAuth();
export default hostAuth;