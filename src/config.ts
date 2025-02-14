/*
FRONTEND: The domain to use as the frontend when embedding pages
SDK: The domain to use as the hosted SDK for managing/creating spaces
COOKIE_DOMAIN: The domain to use for retrieving auth cookies, usually the same as the frontend domain
*/

// These are for local frontend
//// export const FRONTEND = "http://localhost:3000";
//// export const COOKIE_DOMAIN = "localhost";

// These are for hosted frontend
export const FRONTEND = "https://mantisdev.csail.mit.edu";
export const COOKIE_DOMAIN = "mantisdev.csail.mit.edu";

export const SDK = "http://localhost:5111";
export const GOOGLE_API_KEY = "AIzaSyBARjISGhJb6W6njSXUv79hAevE7fQ0RuY";