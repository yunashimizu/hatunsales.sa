import { RolResponse } from "./role-responde";
import { UsuarioLoginResponse } from "./usuario-login-response.model";
import { PermisoResponse } from "./permiso-response.model";

export class loginResponse {
  success: boolean = false;
  mensaje: string = "";
  token: string = "";
  tokenExpira: string = "";
  usuario: UsuarioLoginResponse = new UsuarioLoginResponse();
  rol: RolResponse = new RolResponse();
  permisos: PermisoResponse[] = []; // 👈 array de permisos del rol
}