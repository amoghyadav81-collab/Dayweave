import Planner from './planner';import {requireChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page(){const user=await requireChatGPTUser('/');return <Planner userId={user.userId} displayName={user.displayName}/>}
