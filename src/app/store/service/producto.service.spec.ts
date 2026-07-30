import { ProductoService } from './producto.service';

describe('ProductoService', () => {
  it('should be created', () => {
    const service = new ProductoService({} as any);
    expect(service).toBeTruthy();
  });
});
