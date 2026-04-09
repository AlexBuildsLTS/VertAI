/**
 * utils/validators/auth.ts
 * Professional authentication validation with detailed error messages.
 * Updated for 2026 High-Performance Standards
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * RFC 5322 compliant email regex
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Password requirements for 2026:
 * - Minimum 10 characters (elevated from 8)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const PASSWORD_CHECKS = [
  {
    test: (p: string) => p.length >= 10,
    error: 'Security key must be at least 10 characters',
  },
  {
    test: (p: string) => /[A-Z]/.test(p),
    error: 'Security key must contain an uppercase letter',
  },
  {
    test: (p: string) => /[a-z]/.test(p),
    error: 'Security key must contain a lowercase letter',
  },
  {
    test: (p: string) => /\d/.test(p),
    error: 'Security key must contain a number',
  },
  {
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
    error: 'Security key must contain a special character',
  },
] as const;

export const AuthValidator = {
  /**
   * Validates email format
   */
  isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
  },

  /**
   * Validates email with detailed error
   */
  validateEmail(email: string): ValidationResult {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Identity protocol required (Email)' };
    }
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Email address cannot be empty' };
    }
    if (trimmed.length > 254) {
      return { valid: false, error: 'Identity protocol overflow (Email too long)' };
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      return { valid: false, error: 'Invalid email architecture detected' };
    }
    return { valid: true };
  },

  /**
   * Validates password strength
   */
  isValidPassword(password: string): boolean {
    if (!password || typeof password !== 'string') return false;
    return PASSWORD_CHECKS.every((check) => check.test(password));
  },

  /**
   * Validates password with detailed error
   */
  validatePassword(password: string): ValidationResult {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Security key required' };
    }
    for (const check of PASSWORD_CHECKS) {
      if (!check.test(password)) {
        return { valid: false, error: check.error };
      }
    }
    if (password.length > 128) {
      return { valid: false, error: 'Security key overflow (Too long)' };
    }
    return { valid: true };
  },

  /**
   * Validates display name
   */
  isValidName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  },

  /**
   * Validates name with detailed error
   */
  validateName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Full name required' };
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Identity label too short (Min 2 chars)' };
    }
    if (trimmed.length > 100) {
      return { valid: false, error: 'Identity label overflow (Max 100 chars)' };
    }
    return { valid: true };
  },

  /**
   * Validates username
   */
  validateUsername(username: string): ValidationResult {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username protocol required' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { valid: false, error: 'Username can only contain alphanumeric characters and underscores' };
    }
    return { valid: true };
  },

  /**
   * Validates password confirmation matches
   */
  validatePasswordMatch(password: string, confirm: string): ValidationResult {
    if (password !== confirm) {
      return { valid: false, error: 'Security keys do not synchronize' };
    }
    return { valid: true };
  },

  /**
   * Full sign-up validation
   */
  validateSignUp(
    email: string,
    password: string,
    confirmPassword: string,
    name: string,
    username?: string
  ): ValidationResult {
    const emailResult = this.validateEmail(email);
    if (!emailResult.valid) return emailResult;

    const nameResult = this.validateName(name);
    if (!nameResult.valid) return nameResult;

    if (username) {
      const userResult = this.validateUsername(username);
      if (!userResult.valid) return userResult;
    }

    const passwordResult = this.validatePassword(password);
    if (!passwordResult.valid) return passwordResult;

    const matchResult = this.validatePasswordMatch(password, confirmPassword);
    if (!matchResult.valid) return matchResult;

    return { valid: true };
  },

  /**
   * Full sign-in validation
   */
  validateSignIn(email: string, password: string): ValidationResult {
    const emailResult = this.validateEmail(email);
    if (!emailResult.valid) return emailResult;

    if (!password || password.length === 0) {
      return { valid: false, error: 'Security key required for access' };
    }

    return { valid: true };
  },
};

export default AuthValidator;
