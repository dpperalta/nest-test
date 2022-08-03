import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductImage } from './entities';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { validate as isUUID } from  'uuid';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ProductsService {

  private readonly logger = new Logger('ProductsService');
  
  constructor(

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,

    private readonly dataSource: DataSource,

  ){}


  async create(createProductDto: CreateProductDto, user: User) {
    try {
      const { images = [], ...productDetails } = createProductDto;
      const product = this.productRepository.create({
        ...productDetails,
        images: images.map( image => this.productImageRepository.create({ url: image }) ),
        user
      });
      await this.productRepository.save(product);
      return {
        ...product,
        images
      };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async findAll( paginationDto:PaginationDto ) {
    const { limit = 10, offset = 0 } = paginationDto;
    const products = await this.productRepository.find({
      take: limit,
      skip: offset,
      relations: {
        images: true,
      }
    });
    return products.map( product => ({
      ...product,
      images: product.images.map( img => img.url )
    }) );
  }

  async findOne(term: string) {
    //const products = await this.productRepository.findOneBy({ id });
    //if( !products || products.length === 0 ) throw new NotFoundException(`Product with id "${ id }" doesn't exists`);
    //if( !products || products.length === 0 ) this.handleNotFound('id', id); //Solución con FindBy() Busca más de una coincidencia
    //if( !products ) this.handleNotFound('id', id);
    let product: Product;
    let type: string;
    if ( isUUID(term) ){
      product = await this.productRepository.findOneBy({ id: term });
      type = 'id';
    } else {
      /* product = await this.productRepository.findOneBy({ slug: term });
      type = 'slug'; */
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      product = await queryBuilder
        .where('UPPER(title) =:title or slug =:slug', {
          title: term.toUpperCase(),
          slug: term.toLowerCase()
        })
        .leftJoinAndSelect('prod.images', 'prodImages')
        .getOne();
      type='search param';
    }
    
    if( !product ) this.handleNotFound(type, term);

    return product;
  }

  async findOnePlain( term: string ) {
    const { images = [], ...rest } = await this.findOne( term );
    return {
      ...rest,
      images: images.map( image => image.url )
    }
  }

  async update(id: string, updateProductDto: UpdateProductDto, user: User) {

    const { images, ...toUpdate } = updateProductDto;

    const product = await this.productRepository.preload({
      id,
      ...toUpdate,
    });

    if( !product ) this.handleNotFound('id', id);

    // Create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {

      if( images ){
        await queryRunner.manager.delete(ProductImage, { product: { id } });

        product.images = images.map( 
          image => this.productImageRepository.create({ url: image }) 
        )
      }

      product.user = user;

      await queryRunner.manager.save(product);

      // Se hace commit de todas las transacciones
      await queryRunner.commitTransaction();
      // Se libera el queryRunner
      await queryRunner.release();
      //await this.productRepository.save(product);
      //return product;
      // Se regresa el producto que se obtiene de la consulta al findOnePlain( para mostrar las imagenes cuando no han sido actualizadas)
      return this.findOnePlain(id);
    } catch (error) {
      // Si algo falla, se hace el rollback y se destruye el queryRunner
      await queryRunner.rollbackTransaction();
      await queryRunner.release();

      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    const deletedProduct = await this.productRepository.delete({ id });
    if( deletedProduct.affected === 0 ) this.handleNotFound('id', id);
    return {
      statusCode: 200,
      message: `Product "${id}" deleted successfully`
    }
  }

  private handleDBExceptions ( error: any ) {
    if( error.code === '23505' ) throw new BadRequestException(error.detail);
    //console.log('error:', error);
    this.logger.error(error);
    throw new InternalServerErrorException('Unexpected server error, check server logs');
  }

  private handleNotFound( key: string, value: any ) {
    throw new NotFoundException(`Product with ${ key } "${ value }" doesn't exists`);
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');
    try {
        return await query.delete().where({}).execute();
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

}
