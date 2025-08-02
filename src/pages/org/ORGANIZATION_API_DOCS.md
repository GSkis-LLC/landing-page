# Organization Management API Documentation

This document provides a complete guide to implementing the Organization Management APIs in your client application.

## Prerequisites: User Authentication

Before using any organization APIs, users must be authenticated. The system uses JWT (JSON Web Tokens) for authentication.

### User Registration
**POST** `/api/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": 1,
    "username": "johndoe",
    "name": null,
    "soberDate": null,
    "createdAt": "2025-01-27T10:00:00.000Z",
    "hasFullAccess": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Validation Rules:**
- Username: minimum 3 characters, alphanumeric only, case-insensitive (stored as lowercase)
- Password: minimum 6 characters

### User Login
**POST** `/api/auth/login`

Authenticate existing user and get JWT token.

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "johndoe",
    "name": null,
    "soberDate": null,
    "createdAt": "2025-01-27T10:00:00.000Z",
    "hasFullAccess": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Token Usage
Store the received JWT token and include it in all subsequent API requests:

```javascript
// Store token (example using localStorage)
localStorage.setItem('authToken', response.token);

// Use token in API calls
const token = localStorage.getItem('authToken');
fetch('/api/organizations', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Token Expiration:** Tokens expire after 30 days. Handle 401 responses by redirecting to login.

### Authentication Flow Example

```typescript
class AuthService {
  private token: string | null = null;

  async register(username: string, password: string) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    this.token = data.token;
    localStorage.setItem('authToken', data.token);
    return data;
  }

  async login(username: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    this.token = data.token;
    localStorage.setItem('authToken', data.token);
    return data;
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('authToken');
    }
    return this.token;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}
```

---

## Authentication
All organization endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Data Models

### Organization
```typescript
interface Organization {
  id: number;
  name: string;
  logoUrl?: string;
  primaryColor?: string;   // Hex color code (#RGB or #RRGGBB)
  secondaryColor?: string; // Hex color code (#RGB or #RRGGBB)
  orgCode: string;         // Unique alphanumeric code (2-10 chars)
  createdAt: string;       // ISO date string
  updatedAt: string;       // ISO date string
}
```

### OrganizationMembership
```typescript
interface OrganizationMembership {
  id: number;
  userId: number;
  organizationId: number;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: string;        // ISO date string
  createdAt: string;       // ISO date string
  updatedAt: string;       // ISO date string
}
```

### User (Basic info for member lists)
```typescript
interface UserBasic {
  id: number;
  username: string;
  name?: string;
}
```

## API Endpoints

### 1. Create Organization
**POST** `/api/organizations`

Creates a new organization and automatically makes the creator an admin.

**Request Body:**
```json
{
  "name": "My Recovery Group",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#007bff",
  "secondaryColor": "#6c757d",
  "orgCode": "MRG2024"
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "My Recovery Group",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#007bff",
  "secondaryColor": "#6c757d",
  "orgCode": "MRG2024",
  "createdAt": "2025-01-27T10:00:00.000Z",
  "updatedAt": "2025-01-27T10:00:00.000Z"
}
```

**Required Fields:** `name`, `orgCode`

---

### 2. Update Organization
**PUT** `/api/organizations/:id`

Updates organization details. Only admins can update organizations.

**Request Body:**
```json
{
  "name": "Updated Group Name",
  "logoUrl": "https://example.com/new-logo.png",
  "primaryColor": "#28a745",
  "secondaryColor": "#dc3545"
}
```

**Response (200):** Updated organization object

**Permissions:** Admin only

---

### 3. Get Organization Details
**GET** `/api/organizations/:id`

Retrieves organization details including all members. Only members can view.

**Response (200):**
```json
{
  "id": 1,
  "name": "My Recovery Group",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#007bff",
  "secondaryColor": "#6c757d",
  "orgCode": "MRG2024",
  "createdAt": "2025-01-27T10:00:00.000Z",
  "updatedAt": "2025-01-27T10:00:00.000Z",
  "OrganizationMemberships": [
    {
      "id": 1,
      "userId": 1,
      "organizationId": 1,
      "role": "admin",
      "joinedAt": "2025-01-27T10:00:00.000Z",
      "User": {
        "id": 1,
        "username": "johndoe",
        "name": "John Doe"
      }
    }
  ]
}
```

**Permissions:** Organization members only

---

### 4. Add Member to Organization
**POST** `/api/organizations/:id/members`

Adds a new member to the organization. Only admins can add members.

**Request Body:**
```json
{
  "userId": 2,
  "role": "member"
}
```

**Response (201):**
```json
{
  "id": 2,
  "userId": 2,
  "organizationId": 1,
  "role": "member",
  "joinedAt": "2025-01-27T10:00:00.000Z",
  "createdAt": "2025-01-27T10:00:00.000Z",
  "updatedAt": "2025-01-27T10:00:00.000Z"
}
```

**Valid Roles:** `admin`, `member`, `viewer`
**Permissions:** Admin only

---

### 5. Remove Member from Organization
**DELETE** `/api/organizations/:id/members/:userId`

Removes a member from the organization. Only admins can remove members.

**Response (200):**
```json
{
  "message": "Member removed successfully"
}
```

**Permissions:** Admin only

---

### 6. Get User's Organizations
**GET** `/api/users/:userId/organizations`

Retrieves all organizations that a user belongs to with their role in each.

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "My Recovery Group",
    "logoUrl": "https://example.com/logo.png",
    "primaryColor": "#007bff",
    "secondaryColor": "#6c757d",
    "orgCode": "MRG2024",
    "createdAt": "2025-01-27T10:00:00.000Z",
    "updatedAt": "2025-01-27T10:00:00.000Z",
    "OrganizationMemberships": [
      {
        "role": "admin",
        "joinedAt": "2025-01-27T10:00:00.000Z"
      }
    ]
  }
]
```

**Permissions:** Users can only see their own organizations

---

### 7. Update Member Role
**PUT** `/api/organizations/:id/members/:userId`

Updates a member's role in the organization. Only admins can update roles.

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response (200):**
```json
{
  "id": 2,
  "userId": 2,
  "organizationId": 1,
  "role": "admin",
  "joinedAt": "2025-01-27T10:00:00.000Z",
  "createdAt": "2025-01-27T10:00:00.000Z",
  "updatedAt": "2025-01-27T10:00:00.000Z"
}
```

**Valid Roles:** `admin`, `member`, `viewer`
**Permissions:** Admin only

---

## Permission Levels

### Admin
- Full control over the organization
- Can update organization details
- Can add/remove members
- Can change member roles
- Can view all organization data

### Member
- Can view organization details
- Can participate in organization activities
- Cannot modify organization or member settings

### Viewer
- Read-only access to organization content
- Cannot modify anything
- Limited participation rights

---

## Error Responses

All endpoints return appropriate HTTP status codes with error messages:

**400 Bad Request:**
```json
{
  "error": "Name and orgCode are required"
}
```

**401 Unauthorized:**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden:**
```json
{
  "error": "Access denied. Only admins can update organizations."
}
```

**404 Not Found:**
```json
{
  "error": "Organization not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error message"
}
```
