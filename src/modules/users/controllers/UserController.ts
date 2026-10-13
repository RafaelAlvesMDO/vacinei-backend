import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from '../dtos/user.dto';
import { CreateUserService } from '../services/CreateUserService';
import { GetUserService } from '../services/GetUserService';
import { ListUsersService } from '../services/ListUsersService';
import { UpdateUserService } from '../services/UpdateUserService';
import { DeleteUserService } from '../services/DeleteUserService';
import { AppError } from '../../../errors/AppError';

export class UserController {
  async create(req: Request, res: Response): Promise<Response> {
    const validatedData = createUserSchema.parse(req.body);

    const createUserService = new CreateUserService();
    const user = await createUserService.execute(validatedData, req.user);

    return res.status(201).json({
      status: 'success',
      data: user,
    });
  }

  async show(req: Request, res: Response): Promise<Response> {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = rawId === 'me' || !rawId ? req.user.id : rawId;

    // Apenas o próprio usuário ou ADMIN podem consultar detalhes completos
    if (req.user.role !== UserRole.ADMIN && req.user.id !== targetUserId) {
      throw new AppError('Acesso não autorizado aos dados deste usuário.', 403);
    }

    const getUserService = new GetUserService();
    const user = await getUserService.execute(targetUserId, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: user,
    });
  }

  async index(req: Request, res: Response): Promise<Response> {
    const query = listUsersQuerySchema.parse(req.query);

    const listUsersService = new ListUsersService();
    const result = await listUsersService.execute(query);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async update(req: Request, res: Response): Promise<Response> {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = rawId === 'me' || !rawId ? req.user.id : rawId;

    if (req.user.role !== UserRole.ADMIN && req.user.id !== targetUserId) {
      throw new AppError('Acesso não autorizado para alterar dados deste usuário.', 403);
    }

    const validatedData = updateUserSchema.parse(req.body);

    const updateUserService = new UpdateUserService();
    const updatedUser = await updateUserService.execute(targetUserId, validatedData, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: updatedUser,
    });
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = rawId === 'me' || !rawId ? req.user.id : rawId;

    if (req.user.role !== UserRole.ADMIN && req.user.id !== targetUserId) {
      throw new AppError('Acesso não autorizado para desativar este usuário.', 403);
    }

    const deleteUserService = new DeleteUserService();
    const result = await deleteUserService.execute(targetUserId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }
}
