/**
 * Authentication Validators
 * Ensures clean data before hitting the Supabase Auth API.
 */

export const AuthValidator = {
  isValidEmail: (email: string): boolean => {
    // Standard RFC 5322 regex for email validation
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email.trim());
  },

  isValidPassword: (password: string): { valid: boolean; error?: string } => {
    if (!password) return { valid: false, error: 'Password is required' };
    if (password.length < 8)
      return { valid: false, error: 'Password must be at least 8 characters' };

    // Enterprise constraint: Require at least one number
    if (!/\d/.test(password))
      return {
        valid: false,
        error: 'Password must contain at least one number',
      };

    return { valid: true };
  },

  isValidName: (name: string): boolean => {
    return name.trim().length >= 2;
  },
};
