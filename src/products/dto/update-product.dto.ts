//import { PartialType } from '@nestjs/mapped-types';
import { PartialType } from '@nestjs/swagger'; // Se toma el partialtype de swagger para documentación, si no se usa swaggre tomar de mapped-types
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
