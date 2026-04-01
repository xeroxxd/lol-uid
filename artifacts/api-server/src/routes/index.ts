import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import facebookIdsRouter from "./facebook-ids";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(facebookIdsRouter);

export default router;
