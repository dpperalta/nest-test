import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { User } from '../auth/entities/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

interface ConnectedClients {
    [id: string]: {
        socket: Socket,
        user: User
    }
}

@Injectable()
export class MessagesWsService {

    private connectedClientes: ConnectedClients = {}

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ){}

    async registerClient( client: Socket, userId: string ) {

        const user = await this.userRepository.findOneBy({ id: userId });
        if( !user ) throw new Error ('User not found');
        if( !user.isActive ) throw new Error('User is not active');

        this.checkUserConnection( user );
        
        this.connectedClientes[client.id] = {
            socket: client,
            user
        };
    }

    removeClient( clientId: string ){
        delete this.connectedClientes[clientId];
    }

    getConnectedClients(): string[] {
        return Object.keys( this.connectedClientes );
    }

    getUserFullName( socketId: string ) {
        return this.connectedClientes[socketId].user.fullName;
    }

    private checkUserConnection(user: User) {
        for (const clientId of Object.keys( this.connectedClientes )) {
            const connectedClient = this.connectedClientes[clientId];
            if( connectedClient.user.id === user.id ){
                connectedClient.socket.disconnect();
                break;
            }
        }
    }

}
