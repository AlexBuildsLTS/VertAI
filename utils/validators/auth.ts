/**
 * utils/validators/auth.ts
 * Professional authentication validation with detailed error messages.
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
 * Password requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
const PASSWORD_CHECKS = [
  {
    test: (p: string) => p.length >= 8,
    error: 'Password must be at least 8 characters',
  },
  {
    test: (p: string) => /[A-Z]/.test(p),
    error: 'Password must contain an uppercase letter',
  },
  {
    test: (p: string) => /[a-z]/.test(p),
    error: 'Password must contain a lowercase letter',
  },
  {
    test: (p: string) => /\d/.test(p),
    error: 'Password must contain a number',
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
      return { valid: false, error: 'Email is required' };
    }
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Email is required' };
    }
    if (trimmed.length > 254) {
      return { valid: false, error: 'Email is too long' };
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid email address' };
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
      return { valid: false, error: 'Password is required' };
    }
    for (const check of PASSWORD_CHECKS) {
      if (!check.test(password)) {
        return { valid: false, error: check.error };
      }
    }
    if (password.length > 128) {
      return { valid: false, error: 'Password is too long' };
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
      return { valid: false, error: 'Name is required' };
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }
    if (trimmed.length > 100) {
      return { valid: false, error: 'Name is too long' };
    }
    return { valid: true };
  },

  /**
   * Validates password confirmation matches
   */
  validatePasswordMatch(password: string, confirm: string): ValidationResult {
    if (password !== confirm) {
      return { valid: false, error: 'Passwords do not match' };
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
  ): ValidationResult {
    const emailResult = this.validateEmail(email);
    if (!emailResult.valid) return emailResult;

    const nameResult = this.validateName(name);
    if (!nameResult.valid) return nameResult;

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
      return { valid: false, error: 'Password is required' };
    }

    return { valid: true };
  },
};

export default AuthValidator;
