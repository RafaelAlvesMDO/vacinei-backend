import { Request, Response } from 'express';
import {
  createVaccineSchema,
  updateVaccineSchema,
  listVaccinesQuerySchema,
} from '../dtos/vaccine.dto';
import { ListVaccinesService } from '../services/ListVaccinesService';
import { GetVaccineService } from '../services/GetVaccineService';
import { CreateVaccineService } from '../services/CreateVaccineService';
import { UpdateVaccineService } from '../services/UpdateVaccineService';
import { DeleteVaccineService } from '../services/DeleteVaccineService';

export class VaccineController {
  async index(req: Request, res: Response): Promise<Response> {
    const query = listVaccinesQuerySchema.parse(req.query);

    const listVaccinesService = new ListVaccinesService();
    const vaccines = await listVaccinesService.execute(query);

    return res.status(200).json({
      status: 'success',
      data: vaccines,
    });
  }

  async show(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;

    const getVaccineService = new GetVaccineService();
    const vaccine = await getVaccineService.execute(id);

    return res.status(200).json({
      status: 'success',
      data: vaccine,
    });
  }

  async create(req: Request, res: Response): Promise<Response> {
    const validatedData = createVaccineSchema.parse(req.body);

    const createVaccineService = new CreateVaccineService();
    const vaccine = await createVaccineService.execute(validatedData);

    return res.status(201).json({
      status: 'success',
      data: vaccine,
    });
  }

  async update(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const validatedData = updateVaccineSchema.parse(req.body);

    const updateVaccineService = new UpdateVaccineService();
    const updatedVaccine = await updateVaccineService.execute(id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: updatedVaccine,
    });
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;

    const deleteVaccineService = new DeleteVaccineService();
    const result = await deleteVaccineService.execute(id);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }
}
