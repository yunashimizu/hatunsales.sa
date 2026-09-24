import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { esRolStaff } from '../../auth/roles.constants';
import { StorageUtil } from '../../utils/storage.util';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
})
export class NotFoundComponent {
  /** Personal con sesión: además de la tienda, ofrecemos volver al panel. */
  readonly esStaff = esRolStaff(
    Number(StorageUtil.get('rolId') ?? 0),
    StorageUtil.get('rolNombre') ?? StorageUtil.get('rol'),
  );
}
