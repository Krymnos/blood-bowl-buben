/**
 * League sync (Firebase). This config is public by design: access is enforced by the
 * Firestore Security Rules (firebase/firestore.rules) and the authorized-domain list.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBcIOVehLHEGun3YUUtgYyVEdckHwREyKQ',
  authDomain: 'blood-bowl-buben.firebaseapp.com',
  projectId: 'blood-bowl-buben',
  storageBucket: 'blood-bowl-buben.firebasestorage.app',
  messagingSenderId: '810546460672',
  appId: '1:810546460672:web:85572cfe69840e67ef00e5',
}

/**
 * The league admin's Firebase Auth uid. Must match adminUid() in firebase/firestore.rules.
 * Empty = nobody is admin. To hand the league over: change both places, deploy the rules, push the app.
 */
const LEAGUE_ADMIN_UID = '7XTAKf3B7qVjzBVNB3G26KVXv313'
export const ADMIN_UID: string = (import.meta.env.DEV && import.meta.env.VITE_EMULATOR_ADMIN_UID) || LEAGUE_ADMIN_UID

/** File the admin's phone also writes into its private GitHub backup repository. */
export const LEAGUE_BACKUP_PATH = 'league-backup.json'
