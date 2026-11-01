import { Request, Response } from 'express';
import { dependentIdParamsSchema, dependentRecordParamsSchema, dependentSchema } from '../dtos/dependent.dto';
import { manualVaccinationRecordSchema } from '../../vaccination-records/dtos/vaccination-record.dto';
import { CreateDependentService } from '../services/CreateDependentService';
import { DeleteDependentService } from '../services/DeleteDependentService';
import { GetDependentService } from '../services/GetDependentService';
import { ListDependentsService } from '../services/ListDependentsService';
import { UpdateDependentService } from '../services/UpdateDependentService';
import { CreateManualVaccinationRecordService } from '../../vaccination-records/services/CreateManualVaccinationRecordService';
import { DeleteManualVaccinationRecordService } from '../../vaccination-records/services/DeleteManualVaccinationRecordService';
import { GetDependentVaccinationCardService } from '../services/GetDependentVaccinationCardService';
import { UpdateManualVaccinationRecordService } from '../../vaccination-records/services/UpdateManualVaccinationRecordService';

export class DependentController {
  async index(req: Request, res: Response): Promise<Response> {
    const listDependentsService = new ListDependentsService();
    const dependents = await listDependentsService.execute(req.user.id);

    return res.status(200).json({
      status: 'success',
      data: dependents,
    });
  }

  async create(req: Request, res: Response): Promise<Response> {
    const validatedData = dependentSchema.parse(req.body);

    const createDependentService = new CreateDependentService();
    const dependent = await createDependentService.execute(req.user.id, validatedData);

    return res.status(201).json({
      status: 'success',
      data: dependent,
    });
  }

  async show(req: Request, res: Response): Promise<Response> {
    const { id } = dependentIdParamsSchema.parse(req.params);

    const getDependentService = new GetDependentService();
    const dependent = await getDependentService.execute(req.user.id, id);

    return res.status(200).json({
      status: 'success',
      data: dependent,
    });
  }

  async update(req: Request, res: Response): Promise<Response> {
    const { id } = dependentIdParamsSchema.parse(req.params);
    const validatedData = dependentSchema.parse(req.body);

    const updateDependentService = new UpdateDependentService();
    const dependent = await updateDependentService.execute(req.user.id, id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: dependent,
    });
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const { id } = dependentIdParamsSchema.parse(req.params);

    const deleteDependentService = new DeleteDependentService();
    await deleteDependentService.execute(req.user.id, id);

    return res.status(204).send();
  }

  async card(req: Request, res: Response): Promise<Response> {
    const { id } = dependentIdParamsSchema.parse(req.params);

    const getDependentVaccinationCardService = new GetDependentVaccinationCardService();
    const card = await getDependentVaccinationCardService.execute(id, req.user);

    return res.status(200).json({
      status: 'success',
      data: card,
    });
  }

  async createRecord(req: Request, res: Response): Promise<Response> {
    const { id } = dependentIdParamsSchema.parse(req.params);
    const validatedData = manualVaccinationRecordSchema.parse(req.body);

    const createManualVaccinationRecordService = new CreateManualVaccinationRecordService();
    const result = await createManualVaccinationRecordService.execute(req.user.id, validatedData, id);

    return res.status(201).json({
      status: 'success',
      data: result,
    });
  }

  async updateRecord(req: Request, res: Response): Promise<Response> {
    const { id, recordId } = dependentRecordParamsSchema.parse(req.params);
    const validatedData = manualVaccinationRecordSchema.parse(req.body);

    const updateManualVaccinationRecordService = new UpdateManualVaccinationRecordService();
    const result = await updateManualVaccinationRecordService.execute(req.user.id, recordId, validatedData, id);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async deleteRecord(req: Request, res: Response): Promise<Response> {
    const { id, recordId } = dependentRecordParamsSchema.parse(req.params);

    const deleteManualVaccinationRecordService = new DeleteManualVaccinationRecordService();
    await deleteManualVaccinationRecordService.execute(req.user.id, recordId, id);

    return res.status(204).send();
  }
}
