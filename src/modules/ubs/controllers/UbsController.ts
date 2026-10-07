import { Request, Response } from 'express';
import {
  createUbsSchema,
  updateUbsSchema,
  listUbsQuerySchema,
} from '../dtos/ubs.dto';
import { ListUbsService } from '../services/ListUbsService';
import { GetUbsService } from '../services/GetUbsService';
import { CreateUbsService } from '../services/CreateUbsService';
import { UpdateUbsService } from '../services/UpdateUbsService';
import { DeleteUbsService } from '../services/DeleteUbsService';

export class UbsController {
  async index(req: Request, res: Response): Promise<Response> {
    const query = listUbsQuerySchema.parse(req.query);

    const listUbsService = new ListUbsService();
    const ubss = await listUbsService.execute(query);

    return res.status(200).json({
      status: 'success',
      data: ubss,
    });
  }

  async show(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;

    const getUbsService = new GetUbsService();
    const ubs = await getUbsService.execute(id);

    return res.status(200).json({
      status: 'success',
      data: ubs,
    });
  }

  async create(req: Request, res: Response): Promise<Response> {
    const validatedData = createUbsSchema.parse(req.body);

    const createUbsService = new CreateUbsService();
    const ubs = await createUbsService.execute(validatedData);

    return res.status(201).json({
      status: 'success',
      data: ubs,
    });
  }

  async update(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const validatedData = updateUbsSchema.parse(req.body);

    const updateUbsService = new UpdateUbsService();
    const updatedUbs = await updateUbsService.execute(id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: updatedUbs,
    });
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;

    const deleteUbsService = new DeleteUbsService();
    const result = await deleteUbsService.execute(id);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }
}
