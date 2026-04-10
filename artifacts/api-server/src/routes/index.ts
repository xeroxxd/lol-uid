import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import facebookIdsRouter from "./facebook-ids";
import profileLookupRouter from "./profile-lookup";
import validateBulkRouter from "./validate-bulk";
const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(validateBulkRouter);
router.use(facebookIdsRouter);
router.use(profileLookupRouter);

export default router;
