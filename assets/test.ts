import { _decorator, Component, Node, Animation, Slider } from 'cc';
import { addAdditiveCapability, Layer } from './polyfill';
const { ccclass } = _decorator;

@ccclass('test')
export class test extends Component {
    start() {
        const component = this.getComponent(Animation);

        const xx = addAdditiveCapability(component, ['animation-001']);
        this._xx = xx;

        xx.addLayer('BaseLayer', 1.0).play('animation');

        const layer2 = xx.addLayer('Layer2', 0.2);
        this._q = layer2;
        layer2.play('animation-001');
    }

    update(deltaTime: number) {
        this._xx.update(deltaTime);
    }

    setAdditiveWeight(slider: Slider) {
        this._q.weight = slider.progress;
        // setAdditiveWeight(this.getComponent(Animation)?.getState('animation-001'), slider.progress);
    }

    private _xx: any;
    private _q: Layer;
}

