import { sql } from "../config/db.js";

/**
 * Create a new user
 * @param {Object} userData - User data object
 * @returns {Promise<Object>} Created user object
 */
export const createUser = async (userData) => {
  const { name, email, password, role = "user", phone_number } = userData;

  const result = await sql`
    INSERT INTO users (name, email, password, role, phone_number)
    VALUES (${name}, ${email}, ${password}, ${role}, ${phone_number})
    RETURNING id, name, email, role, phone_number, created_at
  `;

  return result[0];
};

/**
 * Get a user by ID
 * @param {number} id - User ID
 * @returns {Promise<Object>} User object
 */
export const getUserById = async (id) => {
  const result = await sql`
    SELECT id, name, email, role, phone_number, created_at, updated_at
    FROM users
    WHERE id = ${id}
  `;

  return result[0];
};

/**
 * Get a user by email
 * @param {string} email - User email
 * @returns {Promise<Object>} User object
 */
export const getUserByEmail = async (email) => {
  const result = await sql`
    SELECT id, name, email, password, role, phone_number, created_at, updated_at
    FROM users
    WHERE email = ${email}
  `;

  return result[0];
};

/**
 * Update user information
 * @param {number} id - User ID
 * @param {Object} userData - User data to update
 * @returns {Promise<Object>} Updated user object
 */
export const updateUser = async (id, userData) => {
  const { name, email, role, phone_number } = userData;

  const result = await sql`
    UPDATE users
    SET 
      name = COALESCE(${name}, name),
      email = COALESCE(${email}, email),
      role = COALESCE(${role}, role),
      phone_number = COALESCE(${phone_number}, phone_number),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, name, email, role, phone_number, created_at, updated_at
  `;

  return result[0];
};

/**
 * Delete a user
 * @param {number} id - User ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteUser = async (id) => {
  const result = await sql`
    DELETE FROM users
    WHERE id = ${id}
    RETURNING id
  `;

  return result.length > 0;
};

/**
 * Get all users
 * @returns {Promise<Array>} Array of user objects
 */
export const getAllUsers = async () => {
  const result = await sql`
    SELECT id, name, email, role, phone_number, created_at, updated_at
    FROM users
    ORDER BY name
  `;

  return result;
};

/**
 * Change user password
 * @param {number} id - User ID
 * @param {string} newPassword - New password (already hashed)
 * @returns {Promise<boolean>} Success status
 */
export const changePassword = async (id, newPassword) => {
  const result = await sql`
    UPDATE users
    SET password = ${newPassword}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id
  `;

  return result.length > 0;
};
