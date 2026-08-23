/**
 * Identitet routes. Authorization is enforced in the controller (root-only for
 * management, any authenticated user for `me`), so policies stay empty and
 * consistent with the other Oblak APIs.
 */

const route = (method: string, path: string, handler: string, description: string) => ({
  method,
  path,
  handler,
  config: { policies: [], middlewares: [], description, tags: ['Identitet'] },
});

export default {
  routes: [
    route('GET', '/identitet/me', 'identitet.me', 'Current user effective access'),
    route('GET', '/identitet/services', 'identitet.services', 'Service catalogue and levels'),
    route('GET', '/identitet/users', 'identitet.listUsers', 'List users'),
    route('POST', '/identitet/users', 'identitet.createUser', 'Create a member'),
    route('PUT', '/identitet/users/:id', 'identitet.updateUser', 'Update a user grants/blocked'),
    route('DELETE', '/identitet/users/:id', 'identitet.deleteUser', 'Delete a member'),
    route('GET', '/identitet/keys', 'identitet.listKeys', 'List API keys'),
    route('POST', '/identitet/keys', 'identitet.createKey', 'Create an API key'),
    route('DELETE', '/identitet/keys/:id', 'identitet.deleteKey', 'Revoke an API key'),
  ],
};
