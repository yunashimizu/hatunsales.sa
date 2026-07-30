import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('should normalize the backend login response into the frontend shape', () => {
    const service = new AuthService({} as any);

    const normalized = service.normalizeLoginResponse({
      id_usuario: 7,
      nombre: 'Carlos',
      email: 'carlos@test.com',
      rol: 'admin',
      permisos: ['ver_productos'],
      access_token: 'abc123',
      expires_in: '1h',
    });

    expect(normalized.success).toBe(true);
    expect(normalized.mensaje).toBe('Inicio de sesión correcto');
    expect(normalized.token).toBe('abc123');
    expect(normalized.usuario.idUsuario).toBe(7);
    expect(normalized.usuario.nombre).toBe('Carlos');
    expect(normalized.rol.nombre).toBe('admin');
    expect(normalized.permisos[0].nombre).toBe('ver_productos');
  });
});
